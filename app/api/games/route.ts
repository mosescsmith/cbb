import { NextResponse } from 'next/server';
import { fetchTodaysGames } from '@/lib/ncaaService';

export async function GET() {
  try {
    const games = await fetchTodaysGames();
    return NextResponse.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}

// Disable caching for real-time updates
export const dynamic = 'force-dynamic';
export const revalidate = 0;
