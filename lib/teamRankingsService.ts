/**
 * TeamRankings Static Data Service
 *
 * Loads and serves team statistics from static CSV files that are manually updated.
 * Replaces the old NCAA API caching system with simpler, more reliable static data.
 *
 * Data files (in lib/data/team-rankings/):
 * - 1h-points-per-game.csv    (1st half PPG)
 * - 1h-points-allowed.csv     (1st half points allowed)
 * - 1h-margin.csv             (1st half margin)
 * - 2h-points-per-game.csv    (2nd half PPG)
 * - 2h-points-allowed.csv     (2nd half points allowed)
 * - 2h-margin.csv             (2nd half margin)
 */

import fs from 'fs';
import path from 'path';
import { normalizeTeamName, calculateSimilarity } from './teamMatcher';

// Data directory path
const DATA_DIR = path.join(process.cwd(), 'lib', 'data', 'team-rankings');

// CSV file names
const CSV_FILES = {
  firstHalfPPG: '1h-points-per-game.csv',
  firstHalfAllowed: '1h-points-allowed.csv',
  firstHalfMargin: '1h-margin.csv',
  secondHalfPPG: '2h-points-per-game.csv',
  secondHalfAllowed: '2h-points-allowed.csv',
  secondHalfMargin: '2h-margin.csv',
} as const;

// Types for CSV data
export interface TeamRankingRow {
  rank: number;
  team: string;
  season: number | null;      // "2025" column
  last3: number | null;       // "Last 3" column
  last1: number | null;       // "Last 1" column
  home: number | null;        // "Home" column
  away: number | null;        // "Away" column
  prevSeason: number | null;  // "2024" column
}

export interface TeamRankingsData {
  firstHalfPPG: Map<string, TeamRankingRow>;
  firstHalfAllowed: Map<string, TeamRankingRow>;
  firstHalfMargin: Map<string, TeamRankingRow>;
  secondHalfPPG: Map<string, TeamRankingRow>;
  secondHalfAllowed: Map<string, TeamRankingRow>;
  secondHalfMargin: Map<string, TeamRankingRow>;
}

export interface TeamHalfStats {
  ppg: number | null;
  pointsAllowed: number | null;
  margin: number | null;
  // Breakdown by situation
  ppgLast3: number | null;
  ppgLast1: number | null;
  ppgHome: number | null;
  ppgAway: number | null;
  allowedLast3: number | null;
  allowedLast1: number | null;
  allowedHome: number | null;
  allowedAway: number | null;
  marginLast3: number | null;
  marginLast1: number | null;
  marginHome: number | null;
  marginAway: number | null;
}

export interface TeamRankingsStats {
  teamName: string;
  matchedName: string;  // The name we matched in TeamRankings data
  matchConfidence: number;
  firstHalf: TeamHalfStats;
  secondHalf: TeamHalfStats;
}

// In-memory cache of all data
let cachedData: TeamRankingsData | null = null;
let lastLoadTime: number = 0;
const RELOAD_INTERVAL = 5 * 60 * 1000; // 5 minutes - check for file updates

// Team name to normalized key mapping cache
const teamNameCache = new Map<string, string>();

/**
 * Parse a CSV value that might be "--" (no data) or a number
 */
function parseCSVValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '--' || trimmed === '' || trimmed === 'null') {
    return null;
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

/**
 * Parse a CSV file and return a Map keyed by normalized team name
 */
function parseCSVFile(filePath: string): Map<string, TeamRankingRow> {
  const result = new Map<string, TeamRankingRow>();

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`TeamRankings CSV not found: ${filePath}`);
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Parse CSV - handle potential commas in team names by being careful
      // Format: Rank,Team,2025,Last 3,Last 1,Home,Away,2024
      const parts = line.split(',');

      if (parts.length < 8) continue;

      const rank = parseInt(parts[0].trim());
      const team = parts[1].trim();
      const season = parseCSVValue(parts[2]);
      const last3 = parseCSVValue(parts[3]);
      const last1 = parseCSVValue(parts[4]);
      const home = parseCSVValue(parts[5]);
      const away = parseCSVValue(parts[6]);
      const prevSeason = parseCSVValue(parts[7]);

      if (!team || isNaN(rank)) continue;

      const row: TeamRankingRow = {
        rank,
        team,
        season,
        last3,
        last1,
        home,
        away,
        prevSeason,
      };

      // Store by normalized team name for fuzzy matching
      const normalizedName = normalizeTeamName(team);
      result.set(normalizedName, row);

      // Also store the original team name mapping
      teamNameCache.set(normalizedName, team);
    }

    console.log(`Loaded ${result.size} teams from ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Failed to parse CSV ${filePath}:`, error);
  }

  return result;
}

/**
 * Load all CSV data files
 */
function loadAllData(): TeamRankingsData {
  console.log('Loading TeamRankings data from CSV files...');

  const data: TeamRankingsData = {
    firstHalfPPG: parseCSVFile(path.join(DATA_DIR, CSV_FILES.firstHalfPPG)),
    firstHalfAllowed: parseCSVFile(path.join(DATA_DIR, CSV_FILES.firstHalfAllowed)),
    firstHalfMargin: parseCSVFile(path.join(DATA_DIR, CSV_FILES.firstHalfMargin)),
    secondHalfPPG: parseCSVFile(path.join(DATA_DIR, CSV_FILES.secondHalfPPG)),
    secondHalfAllowed: parseCSVFile(path.join(DATA_DIR, CSV_FILES.secondHalfAllowed)),
    secondHalfMargin: parseCSVFile(path.join(DATA_DIR, CSV_FILES.secondHalfMargin)),
  };

  lastLoadTime = Date.now();
  return data;
}

/**
 * Get cached data, reloading if needed
 */
function getData(): TeamRankingsData {
  const now = Date.now();

  // Reload if cache is empty or stale
  if (!cachedData || (now - lastLoadTime > RELOAD_INTERVAL)) {
    cachedData = loadAllData();
  }

  return cachedData;
}

/**
 * Force reload data (useful after manual CSV updates)
 */
export function reloadTeamRankingsData(): void {
  cachedData = loadAllData();
}

/**
 * Find the best matching team in our data
 * Returns: { normalizedKey, originalName, confidence }
 */
function findBestMatch(
  teamName: string,
  dataMap: Map<string, TeamRankingRow>
): { normalizedKey: string; originalName: string; confidence: number } | null {
  const normalizedSearch = normalizeTeamName(teamName);

  // Try exact normalized match first
  if (dataMap.has(normalizedSearch)) {
    const originalName = teamNameCache.get(normalizedSearch) || teamName;
    return { normalizedKey: normalizedSearch, originalName, confidence: 1.0 };
  }

  // Fuzzy match - find best candidate
  let bestMatch: { key: string; similarity: number } | null = null;

  for (const key of dataMap.keys()) {
    const similarity = calculateSimilarity(normalizedSearch, key);

    // Only consider matches above threshold
    if (similarity > 0.7) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { key, similarity };
      }
    }
  }

  // Also try matching against original team names (before normalization)
  for (const [normalizedKey, originalName] of teamNameCache.entries()) {
    if (!dataMap.has(normalizedKey)) continue;

    // Check if search term is contained in original name or vice versa
    const lowerSearch = teamName.toLowerCase();
    const lowerOriginal = originalName.toLowerCase();

    if (lowerOriginal.includes(lowerSearch) || lowerSearch.includes(lowerOriginal)) {
      const similarity = calculateSimilarity(lowerSearch, lowerOriginal);
      if (similarity > 0.6 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { key: normalizedKey, similarity: Math.max(similarity, 0.85) };
      }
    }

    // Special case: "University of X" matching "X"
    // e.g., "University of Arizona" should match "Arizona"
    const universityMatch = lowerOriginal.match(/^(?:university of |the )?(.+?)(?:\s+university)?$/);
    if (universityMatch) {
      const coreName = universityMatch[1];
      if (lowerSearch === coreName || coreName === lowerSearch) {
        return { normalizedKey, originalName, confidence: 0.95 };
      }
    }
  }

  if (bestMatch) {
    const originalName = teamNameCache.get(bestMatch.key) || bestMatch.key;
    return {
      normalizedKey: bestMatch.key,
      originalName,
      confidence: bestMatch.similarity
    };
  }

  return null;
}

/**
 * Get stats for a team by name (with fuzzy matching)
 */
export function getTeamRankingsStats(teamName: string): TeamRankingsStats | null {
  const data = getData();

  // Find best match in any of our data maps
  // We'll use PPG as the primary lookup since it's likely to have the most teams
  const match = findBestMatch(teamName, data.firstHalfPPG) ||
                findBestMatch(teamName, data.secondHalfPPG) ||
                findBestMatch(teamName, data.firstHalfAllowed) ||
                findBestMatch(teamName, data.secondHalfAllowed);

  if (!match) {
    console.log(`TeamRankings: No match found for "${teamName}"`);
    return null;
  }

  const { normalizedKey, originalName, confidence } = match;

  // Fetch all stats for this team
  const fhPPG = data.firstHalfPPG.get(normalizedKey);
  const fhAllowed = data.firstHalfAllowed.get(normalizedKey);
  const fhMargin = data.firstHalfMargin.get(normalizedKey);
  const shPPG = data.secondHalfPPG.get(normalizedKey);
  const shAllowed = data.secondHalfAllowed.get(normalizedKey);
  const shMargin = data.secondHalfMargin.get(normalizedKey);

  const stats: TeamRankingsStats = {
    teamName,
    matchedName: originalName,
    matchConfidence: confidence,
    firstHalf: {
      ppg: fhPPG?.season ?? null,
      pointsAllowed: fhAllowed?.season ?? null,
      margin: fhMargin?.season ?? null,
      ppgLast3: fhPPG?.last3 ?? null,
      ppgLast1: fhPPG?.last1 ?? null,
      ppgHome: fhPPG?.home ?? null,
      ppgAway: fhPPG?.away ?? null,
      allowedLast3: fhAllowed?.last3 ?? null,
      allowedLast1: fhAllowed?.last1 ?? null,
      allowedHome: fhAllowed?.home ?? null,
      allowedAway: fhAllowed?.away ?? null,
      marginLast3: fhMargin?.last3 ?? null,
      marginLast1: fhMargin?.last1 ?? null,
      marginHome: fhMargin?.home ?? null,
      marginAway: fhMargin?.away ?? null,
    },
    secondHalf: {
      ppg: shPPG?.season ?? null,
      pointsAllowed: shAllowed?.season ?? null,
      margin: shMargin?.season ?? null,
      ppgLast3: shPPG?.last3 ?? null,
      ppgLast1: shPPG?.last1 ?? null,
      ppgHome: shPPG?.home ?? null,
      ppgAway: shPPG?.away ?? null,
      allowedLast3: shAllowed?.last3 ?? null,
      allowedLast1: shAllowed?.last1 ?? null,
      allowedHome: shAllowed?.home ?? null,
      allowedAway: shAllowed?.away ?? null,
      marginLast3: shMargin?.last3 ?? null,
      marginLast1: shMargin?.last1 ?? null,
      marginHome: shMargin?.home ?? null,
      marginAway: shMargin?.away ?? null,
    },
  };

  console.log(`TeamRankings: Matched "${teamName}" → "${originalName}" (${(confidence * 100).toFixed(0)}% confidence)`);
  return stats;
}

/**
 * Get all available teams in the data
 */
export function getAllTeamRankingsTeams(): string[] {
  const data = getData();
  const teams = new Set<string>();

  // Collect all team names from all data maps
  for (const [, originalName] of teamNameCache.entries()) {
    teams.add(originalName);
  }

  return Array.from(teams).sort();
}

/**
 * Check if data is loaded and has teams
 */
export function isTeamRankingsDataLoaded(): boolean {
  const data = getData();
  return data.firstHalfPPG.size > 0 || data.secondHalfPPG.size > 0;
}

/**
 * Get fuzzy match candidates for a team name
 * Returns teams with similarity >= threshold (default 50%), sorted by score descending
 */
export function getFuzzyMatchCandidates(
  teamName: string,
  threshold: number = 0.5,
  limit: number = 10
): Array<{ name: string; score: number }> {
  const data = getData();
  const normalizedSearch = normalizeTeamName(teamName);
  const candidates: Array<{ name: string; score: number }> = [];
  const seen = new Set<string>();

  // Search through all teams in the PPG data (most comprehensive)
  for (const [normalizedKey] of data.firstHalfPPG.entries()) {
    const originalName = teamNameCache.get(normalizedKey);
    if (!originalName || seen.has(originalName)) continue;
    seen.add(originalName);

    // Calculate similarity against normalized key
    let similarity = calculateSimilarity(normalizedSearch, normalizedKey);

    // Also check against original name (handles case differences, punctuation)
    const originalSimilarity = calculateSimilarity(
      teamName.toLowerCase(),
      originalName.toLowerCase()
    );
    similarity = Math.max(similarity, originalSimilarity);

    // Boost score if search term is contained in name or vice versa
    const lowerSearch = teamName.toLowerCase();
    const lowerOriginal = originalName.toLowerCase();
    if (lowerOriginal.includes(lowerSearch) || lowerSearch.includes(lowerOriginal)) {
      similarity = Math.max(similarity, 0.7);
    }

    if (similarity >= threshold) {
      candidates.push({ name: originalName, score: similarity });
    }
  }

  // Sort by score descending and limit results
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Helper to format a stat value, showing "N/A" for missing data
 */
function formatStat(value: number | null, suffix: string = ''): string {
  if (value === null) return 'N/A';
  return `${value}${suffix}`;
}

/**
 * Format comprehensive team stats for AI prompt
 * Includes all available fields: Season, Last 3, Last 1, Home, Away
 */
function formatComprehensiveTeamStats(
  stats: TeamRankingsStats,
  context: 'home' | 'away' | 'neutral'
): string {
  const h1 = stats.firstHalf;
  const h2 = stats.secondHalf;
  const lines: string[] = [];

  lines.push(`**${stats.matchedName}** (playing ${context === 'neutral' ? 'at neutral site' : context})`);

  // 1ST HALF STATS
  lines.push(`  1ST HALF STATS:`);
  lines.push(`    Season Avg: ${formatStat(h1.ppg)} PPG | ${formatStat(h1.pointsAllowed)} Allowed | ${formatStat(h1.margin)} Margin`);
  lines.push(`    Last 3 Games: ${formatStat(h1.ppgLast3)} PPG | ${formatStat(h1.allowedLast3)} Allowed | ${formatStat(h1.marginLast3)} Margin`);
  lines.push(`    Last Game: ${formatStat(h1.ppgLast1)} PPG | ${formatStat(h1.allowedLast1)} Allowed | ${formatStat(h1.marginLast1)} Margin`);

  // Home/Away splits with availability notes
  const h1HomeAvail = h1.ppgHome !== null;
  const h1AwayAvail = h1.ppgAway !== null;
  if (h1HomeAvail) {
    lines.push(`    At Home: ${formatStat(h1.ppgHome)} PPG | ${formatStat(h1.allowedHome)} Allowed | ${formatStat(h1.marginHome)} Margin`);
  } else {
    lines.push(`    At Home: No home games played yet`);
  }
  if (h1AwayAvail) {
    lines.push(`    On Road: ${formatStat(h1.ppgAway)} PPG | ${formatStat(h1.allowedAway)} Allowed | ${formatStat(h1.marginAway)} Margin`);
  } else {
    lines.push(`    On Road: No away games played yet`);
  }

  // 2ND HALF STATS
  lines.push(`  2ND HALF STATS:`);
  lines.push(`    Season Avg: ${formatStat(h2.ppg)} PPG | ${formatStat(h2.pointsAllowed)} Allowed | ${formatStat(h2.margin)} Margin`);
  lines.push(`    Last 3 Games: ${formatStat(h2.ppgLast3)} PPG | ${formatStat(h2.allowedLast3)} Allowed | ${formatStat(h2.marginLast3)} Margin`);
  lines.push(`    Last Game: ${formatStat(h2.ppgLast1)} PPG | ${formatStat(h2.allowedLast1)} Allowed | ${formatStat(h2.marginLast1)} Margin`);

  const h2HomeAvail = h2.ppgHome !== null;
  const h2AwayAvail = h2.ppgAway !== null;
  if (h2HomeAvail) {
    lines.push(`    At Home: ${formatStat(h2.ppgHome)} PPG | ${formatStat(h2.allowedHome)} Allowed | ${formatStat(h2.marginHome)} Margin`);
  } else {
    lines.push(`    At Home: No home games played yet`);
  }
  if (h2AwayAvail) {
    lines.push(`    On Road: ${formatStat(h2.ppgAway)} PPG | ${formatStat(h2.allowedAway)} Allowed | ${formatStat(h2.marginAway)} Margin`);
  } else {
    lines.push(`    On Road: No away games played yet`);
  }

  return lines.join('\n');
}

/**
 * Format stats for AI prompt consumption (legacy, simpler format)
 */
export function formatTeamStatsForPrompt(stats: TeamRankingsStats, isHome: boolean): string {
  return formatComprehensiveTeamStats(stats, isHome ? 'home' : 'away');
}

/**
 * Format both teams' stats for the AI prediction prompt
 * Includes comprehensive stats with all fields and handles missing data
 */
export function formatMatchupStatsForPrompt(
  homeStats: TeamRankingsStats | null,
  awayStats: TeamRankingsStats | null,
  isNeutralSite: boolean = false
): string {
  const sections: string[] = [];

  sections.push('=== TEAM HALF STATISTICS (from TeamRankings.com) ===');
  sections.push('');

  if (isNeutralSite) {
    sections.push('🏟️ NEUTRAL SITE GAME - Neither team has home court advantage.');
    sections.push('GUIDANCE: Use Season Averages as primary reference. Away stats can provide');
    sections.push('secondary insight since both teams are away from home, but weight them less');
    sections.push('than season averages. Recent form (Last 3, Last 1) is valuable for momentum.');
    sections.push('');
  }

  // Format home team stats
  if (homeStats) {
    const context = isNeutralSite ? 'neutral' : 'home';
    sections.push(formatComprehensiveTeamStats(homeStats, context));
  } else {
    sections.push('**Home Team**: No stats available in database');
  }

  sections.push(''); // Blank line between teams

  // Format away team stats
  if (awayStats) {
    const context = isNeutralSite ? 'neutral' : 'away';
    sections.push(formatComprehensiveTeamStats(awayStats, context));
  } else {
    sections.push('**Away Team**: No stats available in database');
  }

  sections.push('');
  sections.push('--- STAT INTERPRETATION GUIDE ---');
  sections.push('• Season Avg = Full 2025 season performance');
  sections.push('• Last 3/Last 1 = Recent form and momentum indicators');
  sections.push('• At Home/On Road = Location-specific performance splits');
  sections.push('• Margin = Points scored minus points allowed (positive = outscoring opponents)');
  sections.push('• N/A = Data not available (team may not have played in that situation yet)');

  if (!isNeutralSite) {
    sections.push('');
    sections.push('📍 NON-NEUTRAL GAME: Weight location-specific stats (At Home / On Road)');
    sections.push('   more heavily than season averages for this matchup.');
  }

  return sections.join('\n');
}
