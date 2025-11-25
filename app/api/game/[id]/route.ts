import { NextRequest, NextResponse } from 'next/server';
import { fetchTodaysGames, fetchGameDetail } from '@/lib/ncaaService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First try to get detailed game info (includes halftime scores)
    const detailedGame = await fetchGameDetail(id);

    if (detailedGame) {
      return NextResponse.json(detailedGame);
    }

    // Fallback to today's games list
    const games = await fetchTodaysGames();
    const game = games.find((g) => g.id === id);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(game);
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}
