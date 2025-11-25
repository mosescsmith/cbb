import { NextRequest, NextResponse } from 'next/server';
import { getTeamRankingsStats, isTeamRankingsDataLoaded, getFuzzyMatchCandidates } from '@/lib/teamRankingsService';

/**
 * Team Stats API - Now uses TeamRankings CSV data
 *
 * No longer fetches from NCAA API - uses static CSV data that's manually updated.
 * This is much faster and more reliable than the old NCAA API approach.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const { searchParams } = new URL(request.url);
  const teamName = searchParams.get('teamName');
  const checkOnly = searchParams.get('checkOnly') === 'true';

  if (!teamName) {
    return NextResponse.json(
      { error: 'teamName query parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Check if TeamRankings data is loaded
    if (!isTeamRankingsDataLoaded()) {
      return NextResponse.json({
        teamId,
        teamName,
        _meta: {
          matched: false,
          message: 'TeamRankings data not loaded - CSV files may be missing',
        },
      });
    }

    // Get stats from TeamRankings CSV data
    const stats = getTeamRankingsStats(teamName);

    if (!stats) {
      // Team not found - get fuzzy match suggestions
      const suggestions = getFuzzyMatchCandidates(teamName, 0.5, 8);

      return NextResponse.json({
        teamId,
        teamName,
        suggestions: suggestions.map(s => ({
          name: s.name,
          score: Math.round(s.score * 100),
        })),
        _meta: {
          matched: false,
          stale: false,
          message: suggestions.length > 0
            ? `Team not found. ${suggestions.length} similar teams available.`
            : 'Team not found in TeamRankings data',
          hasSuggestions: suggestions.length > 0,
        },
      });
    }

    // Team found - return stats
    // Format response to be compatible with existing UI expectations
    const response = {
      teamId,
      teamName: stats.matchedName,
      // Include TeamRankings stats in a format the UI can use
      teamRankingsStats: {
        firstHalf: stats.firstHalf,
        secondHalf: stats.secondHalf,
        matchConfidence: stats.matchConfidence,
      },
      // For backwards compatibility with old stats preview UI
      seasonAverages: {
        firstHalf: {
          scored: stats.firstHalf.ppg ?? 0,
          allowed: stats.firstHalf.pointsAllowed ?? 0,
          gamesPlayed: 1, // TeamRankings doesn't give us game count
        },
        secondHalf: {
          scored: stats.secondHalf.ppg ?? 0,
          allowed: stats.secondHalf.pointsAllowed ?? 0,
          gamesPlayed: 1,
        },
      },
      _meta: {
        matched: true,
        stale: false,
        matchedName: stats.matchedName,
        matchConfidence: stats.matchConfidence,
        message: checkOnly ? 'Stats check complete' : 'Using TeamRankings CSV data',
        source: 'teamrankings-csv',
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Error fetching team stats for ${teamId}:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch team stats',
      },
      { status: 500 }
    );
  }
}

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic';
export const revalidate = 0;
