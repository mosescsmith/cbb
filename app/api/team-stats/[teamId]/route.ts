import { NextRequest, NextResponse } from 'next/server';
import { getOrUpdateTeamStats, checkTeamStatsStatus } from '@/lib/statsService';

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
    // Fast path: just check status without fetching
    if (checkOnly) {
      const status = checkTeamStatsStatus(teamId, teamName);
      return NextResponse.json({
        teamId,
        teamName,
        games: status.cache?.games || [],
        seasonAverages: status.cache?.seasonAverages,
        last5Averages: status.cache?.last5Averages,
        lastUpdated: status.cache?.lastUpdated,
        _meta: {
          stale: status.stale,
          matched: status.matched,
          suggestions: status.suggestions,
          message: !status.matched
            ? 'Team not found - showing suggestions'
            : 'Cache check complete',
        },
      });
    }

    // Full path: get or fetch stats
    const result = await getOrUpdateTeamStats(teamId, teamName);

    return NextResponse.json({
      ...result.cache,
      _meta: {
        stale: result.stale,
        matched: result.matched,
        suggestions: result.suggestions,
        message: !result.matched
          ? 'Team not found - showing suggestions'
          : result.stale
          ? 'Using cached data - NCAA API unavailable'
          : 'Data is up to date',
      },
    });
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
