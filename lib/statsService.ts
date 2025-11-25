import { GameStats, HalfStats, TeamStatsCache, NCAAPIGameDetail, TeamStatsResult } from './types';
import { getPrimaryRating } from './ratingsService';
import { getTodaysDate } from './dateUtils';
import { findSimilarTeams, isLikelyMatch } from './teamMatcher';
import fs from 'fs';
import path from 'path';

const NCAA_API_BASE = 'https://ncaa-api.henrygd.me';
const CACHE_DIR = path.join(process.cwd(), 'lib', 'data', 'teams');
const ALIASES_FILE = path.join(process.cwd(), 'lib', 'data', 'team-aliases.json');
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms (reduced from 24h to keep data fresher)
const PRELOAD_GRACE_PERIOD = 10 * 60 * 1000; // 10 minutes - don't re-fetch if preload ran recently

/**
 * Load team aliases from file
 */
function loadTeamAliases(): Record<string, string> {
  try {
    if (!fs.existsSync(ALIASES_FILE)) {
      return {};
    }
    const data = fs.readFileSync(ALIASES_FILE, 'utf-8');
    const aliases = JSON.parse(data);
    delete aliases._comment; // Remove comment field
    return aliases;
  } catch (error) {
    console.error('Failed to load team aliases:', error);
    return {};
  }
}

/**
 * Resolve team ID using aliases
 */
function resolveTeamId(teamId: string): string {
  const aliases = loadTeamAliases();
  const normalizedId = teamId.toLowerCase();
  return aliases[normalizedId] || teamId;
}

/**
 * Get all available cached teams
 */
function getAllCachedTeams(): Array<{ teamId: string; teamName: string; gamesCount: number }> {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return [];
    }

    const files = fs.readdirSync(CACHE_DIR);
    const teams = files
      .filter(f => f.endsWith('.json'))
      .map(file => {
        try {
          const data = fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8');
          const cache: TeamStatsCache = JSON.parse(data);
          return {
            teamId: cache.teamId,
            teamName: cache.teamName,
            gamesCount: cache.games.length,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ teamId: string; teamName: string; gamesCount: number }>;

    return teams;
  } catch (error) {
    console.error('Failed to get cached teams:', error);
    return [];
  }
}

/**
 * Fetch detailed game info including linescores
 */
export async function fetchGameDetail(gameId: string): Promise<NCAAPIGameDetail | null> {
  try {
    const response = await fetch(`${NCAA_API_BASE}/game/${gameId}`, {
      signal: AbortSignal.timeout(8000) // 8 second timeout
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch game ${gameId}:`, error);
    return null;
  }
}

/**
 * Parse game detail to extract period stats
 */
export function parseGameStats(
  gameDetail: NCAAPIGameDetail,
  teamId: string,
  teamSeoName?: string
): GameStats | null {
  const contest = gameDetail.contests[0];
  if (!contest || !contest.linescores || contest.linescores.length < 2) {
    return null;
  }

  // Find team by numeric ID or SEO name
  const team = contest.teams.find((t: any) =>
    t.teamId === teamId || t.seoname === teamId || (teamSeoName && t.seoname === teamSeoName)
  );
  const opponent = contest.teams.find((t: any) => t !== team);

  if (!team || !opponent) return null;

  const period1 = contest.linescores[0];
  const period2 = contest.linescores[1];

  const teamIsHome = team.isHome;
  const firstHalfScored = parseInt(teamIsHome ? period1.home : period1.visit);
  const firstHalfAllowed = parseInt(teamIsHome ? period1.visit : period1.home);
  const secondHalfScored = parseInt(teamIsHome ? period2.home : period2.visit);
  const secondHalfAllowed = parseInt(teamIsHome ? period2.visit : period2.home);

  // Try to get opponent rating
  const opponentRating = getPrimaryRating(opponent.teamId);

  return {
    gameId: contest.id,
    date: contest.startDate || '',
    opponent: opponent.nameShort,
    opponentId: opponent.teamId,
    isHome: teamIsHome,
    opponentRating,
    firstHalf: {
      scored: firstHalfScored,
      allowed: firstHalfAllowed,
    },
    secondHalf: {
      scored: secondHalfScored,
      allowed: secondHalfAllowed,
    },
  };
}

/**
 * Calculate averages for a set of games
 */
export function calculateAverages(games: GameStats[]): {
  firstHalf: HalfStats;
  secondHalf: HalfStats;
} {
  if (games.length === 0) {
    return {
      firstHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
      secondHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
    };
  }

  const firstHalfScored = games.reduce((sum, g) => sum + g.firstHalf.scored, 0);
  const firstHalfAllowed = games.reduce((sum, g) => sum + g.firstHalf.allowed, 0);
  const secondHalfScored = games.reduce((sum, g) => sum + g.secondHalf.scored, 0);
  const secondHalfAllowed = games.reduce((sum, g) => sum + g.secondHalf.allowed, 0);

  const count = games.length;

  return {
    firstHalf: {
      scored: Math.round((firstHalfScored / count) * 10) / 10,
      allowed: Math.round((firstHalfAllowed / count) * 10) / 10,
      gamesPlayed: count,
    },
    secondHalf: {
      scored: Math.round((secondHalfScored / count) * 10) / 10,
      allowed: Math.round((secondHalfAllowed / count) * 10) / 10,
      gamesPlayed: count,
    },
  };
}

/**
 * Calculate strength of schedule metrics from game list
 */
export function calculateStrengthOfSchedule(games: GameStats[]): {
  average: number;
  weightedAverage: number;
  gamesWithRatings: number;
} | undefined {
  const gamesWithRatings = games.filter(g => g.opponentRating !== undefined);

  if (gamesWithRatings.length === 0) {
    return undefined;
  }

  // Simple average of opponent ratings
  const sum = gamesWithRatings.reduce((acc, g) => acc + (g.opponentRating || 0), 0);
  const average = Math.round((sum / gamesWithRatings.length) * 10) / 10;

  // Weighted average (more recent games weighted higher)
  // Weight formula: newer games get higher weight (exponential decay)
  let weightedSum = 0;
  let totalWeight = 0;

  gamesWithRatings.forEach((game, index) => {
    // Most recent game (index 0) gets highest weight
    const weight = Math.exp(-index * 0.15); // Decay factor of 0.15
    weightedSum += (game.opponentRating || 0) * weight;
    totalWeight += weight;
  });

  const weightedAverage = Math.round((weightedSum / totalWeight) * 10) / 10;

  return {
    average,
    weightedAverage,
    gamesWithRatings: gamesWithRatings.length,
  };
}

/**
 * Calculate weighted averages that adjust for opponent strength
 * Stats against stronger opponents are weighted higher
 */
export function calculateWeightedAverages(games: GameStats[]): {
  firstHalf: HalfStats;
  secondHalf: HalfStats;
} {
  if (games.length === 0) {
    return {
      firstHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
      secondHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
    };
  }

  // Separate games into those with and without ratings
  const gamesWithRatings = games.filter(g => g.opponentRating !== undefined);
  const gamesWithoutRatings = games.filter(g => g.opponentRating === undefined);

  // If no games have ratings, return regular averages
  if (gamesWithRatings.length === 0) {
    return calculateAverages(games);
  }

  // Calculate average opponent rating for normalization
  const avgOpponentRating = gamesWithRatings.reduce((sum, g) => sum + (g.opponentRating || 0), 0) / gamesWithRatings.length;

  // Calculate weighted stats
  let firstHalfScoredWeighted = 0;
  let firstHalfAllowedWeighted = 0;
  let secondHalfScoredWeighted = 0;
  let secondHalfAllowedWeighted = 0;
  let totalWeight = 0;

  gamesWithRatings.forEach(game => {
    // Weight = opponent rating / average rating
    // Strong opponents (rating > avg) get weight > 1
    // Weak opponents (rating < avg) get weight < 1
    const weight = (game.opponentRating || avgOpponentRating) / avgOpponentRating;

    firstHalfScoredWeighted += game.firstHalf.scored * weight;
    firstHalfAllowedWeighted += game.firstHalf.allowed * weight;
    secondHalfScoredWeighted += game.secondHalf.scored * weight;
    secondHalfAllowedWeighted += game.secondHalf.allowed * weight;
    totalWeight += weight;
  });

  // For games without ratings, use average weight of 1.0
  gamesWithoutRatings.forEach(game => {
    firstHalfScoredWeighted += game.firstHalf.scored;
    firstHalfAllowedWeighted += game.firstHalf.allowed;
    secondHalfScoredWeighted += game.secondHalf.scored;
    secondHalfAllowedWeighted += game.secondHalf.allowed;
    totalWeight += 1.0;
  });

  return {
    firstHalf: {
      scored: Math.round((firstHalfScoredWeighted / totalWeight) * 10) / 10,
      allowed: Math.round((firstHalfAllowedWeighted / totalWeight) * 10) / 10,
      gamesPlayed: games.length,
    },
    secondHalf: {
      scored: Math.round((secondHalfScoredWeighted / totalWeight) * 10) / 10,
      allowed: Math.round((secondHalfAllowedWeighted / totalWeight) * 10) / 10,
      gamesPlayed: games.length,
    },
  };
}

/**
 * Load team stats from cache
 */
export function loadTeamStatsCache(teamId: string): TeamStatsCache | null {
  try {
    const filePath = path.join(CACHE_DIR, `${teamId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load cache for team ${teamId}:`, error);
    return null;
  }
}

/**
 * Save team stats to cache
 */
export function saveTeamStatsCache(cache: TeamStatsCache): void {
  try {
    // Ensure directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const filePath = path.join(CACHE_DIR, `${cache.teamId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save cache for team ${cache.teamId}:`, error);
  }
}

/**
 * Check if cache is stale (older than 6 hours)
 */
export function isCacheStale(cache: TeamStatsCache): boolean {
  const lastUpdated = new Date(cache.lastUpdated).getTime();
  const now = Date.now();
  return now - lastUpdated > CACHE_TTL;
}

/**
 * Check if cache was updated very recently (within grace period)
 * Used to avoid re-fetching immediately after preload
 */
export function isCacheFresh(cache: TeamStatsCache): boolean {
  const lastUpdated = new Date(cache.lastUpdated).getTime();
  const now = Date.now();
  return now - lastUpdated < PRELOAD_GRACE_PERIOD;
}

/**
 * Fetch team's game history by searching recent scoreboards
 * NOTE: This is a workaround since NCAA API doesn't have team schedule endpoint
 * We'll search backwards through recent dates to find team's games
 */
export async function fetchTeamGameHistory(
  teamId: string,
  teamName: string,
  daysBack: number = 14
): Promise<GameStats[]> {
  const gameStats: GameStats[] = [];
  const today = getTodaysDate(); // Use adjusted date
  const seenGameIds = new Set<string>(); // Prevent duplicates
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  // Search backwards day by day
  for (let i = 0; i < daysBack; i++) {
    // Stop if we've had too many consecutive failures (API might be down)
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`Stopping search for ${teamName} after ${consecutiveFailures} consecutive failures`);
      break;
    }
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    try {
      const response = await fetch(
        `${NCAA_API_BASE}/scoreboard/basketball-men/d1/${year}/${month}/${day}/all-conf`,
        { signal: AbortSignal.timeout(10000) } // 10 second timeout
      );

      if (!response.ok) {
        consecutiveFailures++;
        continue;
      }

      // Reset failure counter on successful response
      consecutiveFailures = 0;

      const data = await response.json();

      // Check scoreboard for potential matches first (faster than fetching all game details)
      // Convert team name to SEO format: lowercase, replace spaces with dashes, remove dots/punctuation
      const seoName = teamName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      // Generate alternative SEO patterns to handle various naming conventions
      const seoVariants = new Set([seoName, teamId]);

      // Strip common prefixes/suffixes to get core name
      let coreName = teamName.toLowerCase();

      // Remove common suffixes
      const suffixes = ['university', 'college', 'state university', 'state'];
      for (const suffix of suffixes) {
        if (coreName.endsWith(' ' + suffix)) {
          coreName = coreName.slice(0, -(suffix.length + 1)).trim();
        }
      }

      // Remove common prefixes like "University of", "College of"
      const prefixes = ['university of ', 'the university of ', 'college of ', 'the '];
      for (const prefix of prefixes) {
        if (coreName.startsWith(prefix)) {
          coreName = coreName.slice(prefix.length).trim();
        }
      }

      // Add the core name as a variant (e.g., "University of Oregon" → "oregon")
      const coreNameSeo = coreName.replace(/\./g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      seoVariants.add(coreNameSeo);

      // Add common abbreviation patterns
      const words = teamName.toLowerCase().split(/\s+/);
      if (words.length >= 2) {
        // "Missouri State" → "missouri-st"
        if (words[1] === 'state' || words[1] === 'st' || words[1] === 'st.') {
          seoVariants.add(`${words[0]}-st`);
        }
        // Handle "X State University" → "x-st"
        const stateIdx = words.indexOf('state');
        if (stateIdx > 0) {
          seoVariants.add(words.slice(0, stateIdx).join('-') + '-st');
        }
        // First two words joined: "Missouri State University" → "missouri-state"
        seoVariants.add(words.slice(0, 2).join('-').replace(/\./g, ''));
        // Just first word
        seoVariants.add(words[0].replace(/\./g, ''));
      }

      // Handle "Long Island University" → "long-island"
      if (words.includes('university')) {
        seoVariants.add(words.filter(w => w !== 'university').join('-').replace(/\./g, ''));
      }

      // Handle "University of X" patterns → just "x"
      const uniOfIdx = words.indexOf('of');
      if (words[0] === 'university' && uniOfIdx === 1 && words.length > 2) {
        seoVariants.add(words.slice(2).join('-').replace(/\./g, ''));
      }

      const potentialGames = data.games?.filter((g: any) => {
        const game = g.game;
        const homeSeo = game.home?.names?.seo || '';
        const awaySeo = game.away?.names?.seo || '';
        // Match by any SEO variant
        for (const variant of seoVariants) {
          if (homeSeo === variant || awaySeo === variant) {
            return true;
          }
          // Also try partial match for common patterns
          if (homeSeo.startsWith(variant.split('-')[0]) || awaySeo.startsWith(variant.split('-')[0])) {
            // Verify it's a close match (first word matches)
            const firstWord = variant.split('-')[0];
            if ((homeSeo.startsWith(firstWord + '-') || homeSeo === firstWord) ||
                (awaySeo.startsWith(firstWord + '-') || awaySeo === firstWord)) {
              return true;
            }
          }
        }
        return false;
      }) || [];

      // Fetch details for potential matches to verify team IDs
      for (const g of potentialGames) {
        const gameId = g.game.gameID;

        // Skip if we've already processed this game
        if (seenGameIds.has(gameId)) continue;

        const gameDetail = await fetchGameDetail(gameId);
        if (!gameDetail) continue;

        const contest = gameDetail.contests[0];
        if (!contest?.teams) continue;

        // Check if this game involves our team by matching team ID or SEO name
        const teamInGame = contest.teams.find((t: any) => {
          // Match by numeric team ID (preferred)
          if (t.teamId === teamId) return true;

          // Match by SEO name (handles SEO-name IDs from today's games)
          if (t.seoname === teamId) return true;
          if (t.seoname === seoName) return true;

          return false;
        });

        if (teamInGame) {
          // This game involves our team!
          seenGameIds.add(gameId);
          const stats = parseGameStats(gameDetail, teamId, seoName);
          if (stats) {
            gameStats.push(stats);
          }
        }
      }
    } catch (error) {
      consecutiveFailures++;
      console.error(`Failed to fetch games for ${year}/${month}/${day} (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error);
    }
  }

  return gameStats;
}

/**
 * Build team stats cache from game list
 */
export function buildStatsCache(
  teamId: string,
  teamName: string,
  games: GameStats[]
): TeamStatsCache {
  // Sort games by date (most recent first)
  const sortedGames = [...games].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const seasonAverages = calculateAverages(sortedGames);
  const last5Games = sortedGames.slice(0, 5);
  const last5Averages = calculateAverages(last5Games);
  const strengthOfSchedule = calculateStrengthOfSchedule(sortedGames);

  return {
    teamId,
    teamName,
    lastUpdated: new Date().toISOString(),
    games: sortedGames,
    seasonAverages,
    last5Averages,
    strengthOfSchedule,
  };
}

/**
 * Check team stats status without fetching (fast, cache-only)
 * Used for UI status checks that shouldn't block
 */
export function checkTeamStatsStatus(
  teamId: string,
  teamName: string
): {
  cache: TeamStatsCache | null;
  stale: boolean;
  matched: boolean;
  suggestions?: Array<{ teamId: string; teamName: string; similarity: number; gamesCount: number }>;
} {
  // Try to find existing cache using multiple strategies
  const found = tryFindTeamCache(teamId, teamName);

  if (found) {
    const stale = isCacheStale(found.cache);
    return {
      cache: found.cache,
      stale,
      matched: true,
    };
  }

  // No cache found - return suggestions without fetching
  const cachedTeams = getAllCachedTeams();
  const suggestions = findSimilarTeams(teamName, cachedTeams, 5);

  return {
    cache: null,
    stale: false,
    matched: false,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Create an empty cache for teams with no data
 */
function createEmptyCache(teamId: string, teamName: string): TeamStatsCache {
  return {
    teamId,
    teamName,
    lastUpdated: new Date().toISOString(),
    games: [],
    seasonAverages: {
      firstHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
      secondHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
    },
    last5Averages: {
      firstHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
      secondHalf: { scored: 0, allowed: 0, gamesPlayed: 0 },
    },
  };
}

/**
 * Convert team name to SEO-style format for alias lookup
 */
function toSeoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Generate SEO name variants for a team name
 * Handles patterns like "University of Arizona" → "arizona"
 */
function generateSeoVariants(teamName: string): string[] {
  const variants: string[] = [];
  const seoName = toSeoName(teamName);
  variants.push(seoName);

  // Strip common prefixes/suffixes to get core name
  let coreName = teamName.toLowerCase();

  // Remove common suffixes
  const suffixes = ['university', 'college', 'state university', 'state'];
  for (const suffix of suffixes) {
    if (coreName.endsWith(' ' + suffix)) {
      coreName = coreName.slice(0, -(suffix.length + 1)).trim();
    }
  }

  // Remove common prefixes like "University of", "College of"
  const prefixes = ['university of ', 'the university of ', 'college of ', 'the '];
  for (const prefix of prefixes) {
    if (coreName.startsWith(prefix)) {
      coreName = coreName.slice(prefix.length).trim();
    }
  }

  // Add the core name as a variant (e.g., "University of Arizona" → "arizona")
  const coreNameSeo = coreName.replace(/\./g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (coreNameSeo && coreNameSeo !== seoName) {
    variants.push(coreNameSeo);
  }

  // Add common abbreviation patterns
  const words = teamName.toLowerCase().split(/\s+/);
  if (words.length >= 2) {
    // "Missouri State" → "missouri-st"
    if (words[1] === 'state' || words[1] === 'st' || words[1] === 'st.') {
      variants.push(`${words[0]}-st`);
    }
    // First word only (e.g. "Arizona")
    if (words[0].length > 3) {
      variants.push(words[0].replace(/\./g, ''));
    }
  }

  return [...new Set(variants)]; // Remove duplicates
}

/**
 * Try to find team cache using multiple strategies
 * Returns: { cache, matched, resolvedId } or null if not found
 */
function tryFindTeamCache(teamId: string, teamName: string): {
  cache: TeamStatsCache;
  resolvedId: string;
} | null {
  // Strategy 1: Try exact ID match first
  let cache = loadTeamStatsCache(teamId);
  if (cache) {
    return { cache, resolvedId: teamId };
  }

  // Strategy 2: Try alias lookup with teamId (SEO name from games API)
  const resolvedId = resolveTeamId(teamId);
  if (resolvedId !== teamId) {
    cache = loadTeamStatsCache(resolvedId);
    if (cache) {
      console.log(`Found team ${teamId} via alias → ${resolvedId}`);
      return { cache, resolvedId };
    }
  }

  // Strategy 3: Try all SEO name variants
  const seoVariants = generateSeoVariants(teamName);
  for (const variant of seoVariants) {
    // Try direct cache lookup
    cache = loadTeamStatsCache(variant);
    if (cache) {
      console.log(`Found team ${teamName} via SEO variant → ${variant}`);
      return { cache, resolvedId: variant };
    }

    // Try alias lookup for each variant
    const aliasResolved = resolveTeamId(variant);
    if (aliasResolved !== variant) {
      cache = loadTeamStatsCache(aliasResolved);
      if (cache) {
        console.log(`Found team ${teamName} via SEO variant alias (${variant}) → ${aliasResolved}`);
        return { cache, resolvedId: aliasResolved };
      }
    }
  }

  // Strategy 4: Search cached teams by fuzzy name match (stricter now)
  const cachedTeams = getAllCachedTeams();
  for (const cachedTeam of cachedTeams) {
    if (isLikelyMatch(teamName, cachedTeam.teamName)) {
      cache = loadTeamStatsCache(cachedTeam.teamId);
      if (cache) {
        console.log(`Found team ${teamName} via fuzzy match → ${cachedTeam.teamName} (${cachedTeam.teamId})`);
        return { cache, resolvedId: cachedTeam.teamId };
      }
    }
  }

  return null;
}

/**
 * Get or update team stats with smart matching
 * Returns TeamStatsResult with match status and suggestions if not found
 */
export async function getOrUpdateTeamStats(
  teamId: string,
  teamName: string
): Promise<TeamStatsResult> {
  // Try to find existing cache using multiple strategies
  const found = tryFindTeamCache(teamId, teamName);

  if (found) {
    const { cache: existingCache, resolvedId } = found;

    // If cache has games and is fresh, return it
    if (existingCache.games.length > 0 && !isCacheStale(existingCache)) {
      return { cache: existingCache, stale: false, matched: true };
    }

    // If cache has games and is within grace period, return it
    if (existingCache.games.length > 0 && isCacheFresh(existingCache)) {
      console.log(`Cache for team ${resolvedId} was just updated by preload, using it`);
      return { cache: existingCache, stale: false, matched: true };
    }

    // If cache has 0 games, always try to fetch fresh data with full 30-day lookback
    if (existingCache.games.length === 0) {
      console.log(`Cache for team ${resolvedId} has 0 games, attempting full 30-day fetch...`);
      try {
        const games = await fetchTeamGameHistory(resolvedId, existingCache.teamName, 30);
        if (games.length > 0) {
          const updatedCache = buildStatsCache(resolvedId, existingCache.teamName, games);
          saveTeamStatsCache(updatedCache);
          return { cache: updatedCache, stale: false, matched: true };
        }
        // No games found - return empty cache
        return { cache: existingCache, stale: false, matched: true };
      } catch (error) {
        console.error(`Failed to fetch stats for team ${resolvedId}:`, error);
        return { cache: existingCache, stale: true, matched: true };
      }
    }

    // Cache is stale, fetch new games (incremental 7-day update)
    console.log(`Cache stale for team ${resolvedId}, fetching new games...`);

    try {
      const newGames = await fetchTeamGameHistory(resolvedId, existingCache.teamName, 7);
      const existingGameIds = new Set(existingCache.games.map((g) => g.gameId));
      const freshGames = newGames.filter((g) => !existingGameIds.has(g.gameId));

      if (freshGames.length > 0) {
        console.log(`Found ${freshGames.length} new games for team ${resolvedId}`);
      }

      const allGames = [...existingCache.games, ...freshGames];
      const updatedCache = buildStatsCache(resolvedId, existingCache.teamName, allGames);
      saveTeamStatsCache(updatedCache);

      return { cache: updatedCache, stale: false, matched: true };
    } catch (error) {
      console.error(`Failed to update stats for team ${resolvedId}, using stale cache:`, error);
      return { cache: existingCache, stale: true, matched: true };
    }
  }

  // No cache found - try fetching fresh data
  console.log(`No cache found for team ${teamId} (${teamName}), attempting to fetch...`);

  try {
    const games = await fetchTeamGameHistory(teamId, teamName, 30);

    if (games.length > 0) {
      // Successfully fetched games
      const cache = buildStatsCache(teamId, teamName, games);
      saveTeamStatsCache(cache);
      return { cache, stale: false, matched: true };
    }
  } catch (error) {
    console.error(`Failed to fetch stats for team ${teamId}:`, error);
  }

  // No data found - return empty cache with suggestions
  console.log(`Could not find stats for team ${teamId} (${teamName}), generating suggestions...`);

  const cachedTeams = getAllCachedTeams();
  const suggestions = findSimilarTeams(teamName, cachedTeams, 5);

  return {
    cache: createEmptyCache(teamId, teamName),
    stale: false,
    matched: false,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}
