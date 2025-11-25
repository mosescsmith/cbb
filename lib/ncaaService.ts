import { Game, NCAAPIGame, Team } from './types';
import { getTodaysDate } from './dateUtils';

const NCAA_API_BASE = 'https://ncaa-api.henrygd.me';

/**
 * Fetch games for a specific date from NCAA API
 * @param date Date in YYYY-MM-DD format
 */
export async function fetchGamesForDate(date: Date): Promise<Game[]> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  try {
    const response = await fetch(
      `${NCAA_API_BASE}/scoreboard/basketball-men/d1/${year}/${month}/${day}/all-conf`,
      { next: { revalidate: 60 } } // Cache for 1 minute
    );

    if (!response.ok) {
      throw new Error(`NCAA API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform NCAA API format to our Game format
    // Use SEO names as team IDs directly (faster, no extra API calls needed)
    // The team matching system handles ID variations
    const games: Game[] = (data.games || []).map((ncaaGame: NCAAPIGame) => {
      const g = ncaaGame.game;

      return {
        id: g.gameID,
        date: `${g.startDate}T${g.startTime}`,
        startTimeEpoch: g.startTimeEpoch,
        homeTeam: {
          id: g.home.names.seo, // Use SEO name as ID - team matcher handles variations
          name: g.home.names.full || g.home.names.short,
          shortName: g.home.names.short,
          rank: g.home.rank ? parseInt(g.home.rank) : undefined,
        } as Team,
        awayTeam: {
          id: g.away.names.seo,
          name: g.away.names.full || g.away.names.short,
          shortName: g.away.names.short,
          rank: g.away.rank ? parseInt(g.away.rank) : undefined,
        } as Team,
        location: 'home', // Default to home; user can edit
        status: mapGameStatus(g.gameState),
        currentPeriod: g.currentPeriod,
        homeScore: g.home.score ? parseInt(g.home.score) : undefined,
        awayScore: g.away.score ? parseInt(g.away.score) : undefined,
      };
    });

    // Sort: Live/Scheduled first (by time), Final games last (by time)
    const sortedGames = games.sort((a, b) => {
      const aIsFinal = a.status === 'final';
      const bIsFinal = b.status === 'final';

      // If one is final and one is not, non-final comes first
      if (aIsFinal && !bIsFinal) return 1;
      if (!aIsFinal && bIsFinal) return -1;

      // Both same status, sort by start time
      return (a.startTimeEpoch || 0) - (b.startTimeEpoch || 0);
    });

    return sortedGames;
  } catch (error) {
    console.error('Failed to fetch NCAA games:', error);
    return [];
  }
}

function mapGameStatus(ncaaStatus: string): Game['status'] {
  const lower = ncaaStatus.toLowerCase();
  if (lower.includes('final')) return 'final';
  if (lower.includes('half')) return 'halftime';
  if (lower.includes('live') || lower.includes('progress')) return 'in_progress';
  return 'scheduled';
}

/**
 * Fetch detailed game info including halftime scores
 */
export async function fetchGameDetail(gameId: string): Promise<Game | null> {
  try {
    const response = await fetch(`${NCAA_API_BASE}/game/${gameId}`, {
      next: { revalidate: 30 } // Cache for 30 seconds (live data)
    });

    if (!response.ok) return null;

    const data = await response.json();
    const contest = data.contests?.[0];

    if (!contest) return null;

    const homeTeam = contest.teams.find((t: any) => t.isHome);
    const awayTeam = contest.teams.find((t: any) => !t.isHome);

    if (!homeTeam || !awayTeam) return null;

    // Extract halftime scores from linescores
    let halftimeHomeScore: number | undefined;
    let halftimeAwayScore: number | undefined;

    if (contest.linescores && contest.linescores.length >= 1) {
      const period1 = contest.linescores[0];
      halftimeHomeScore = parseInt(period1.home);
      halftimeAwayScore = parseInt(period1.visit);
    }

    // Current scores (sum of all periods)
    let homeScore = 0;
    let awayScore = 0;

    if (contest.linescores) {
      contest.linescores.forEach((period: any) => {
        homeScore += parseInt(period.home || 0);
        awayScore += parseInt(period.visit || 0);
      });
    }

    return {
      id: contest.id,
      date: contest.startDate || '',
      homeTeam: {
        id: homeTeam.teamId,
        name: homeTeam.nameFull,
        shortName: homeTeam.nameShort,
      } as Team,
      awayTeam: {
        id: awayTeam.teamId,
        name: awayTeam.nameFull,
        shortName: awayTeam.nameShort,
      } as Team,
      location: 'home',
      status: 'in_progress', // Can be refined based on contest data
      homeScore,
      awayScore,
      halftimeHomeScore,
      halftimeAwayScore,
    };
  } catch (error) {
    console.error(`Failed to fetch game detail for ${gameId}:`, error);
    return null;
  }
}

/**
 * Get today's games
 */
export async function fetchTodaysGames(): Promise<Game[]> {
  return fetchGamesForDate(getTodaysDate());
}
