'use client';

import { useState, useEffect } from 'react';
import { GameCard } from '@/components/GameCard';
import { Game } from '@/lib/types';

interface GameWithStats extends Game {
  hasVerifiedStats?: boolean;
}

export default function HomePage() {
  const [games, setGames] = useState<GameWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);
  const [checkingStats, setCheckingStats] = useState(false);

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games');
      if (!response.ok) throw new Error('Failed to fetch games');
      const data = await response.json();
      setGames(data.map((g: Game) => ({ ...g, hasVerifiedStats: undefined })));
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Check stats availability for all games
  const checkStatsAvailability = async () => {
    if (games.length === 0) return;

    setCheckingStats(true);

    const updatedGames = await Promise.all(
      games.map(async (game) => {
        try {
          const [homeRes, awayRes] = await Promise.all([
            fetch(`/api/team-stats/${game.homeTeam.id}?teamName=${encodeURIComponent(game.homeTeam.name)}&checkOnly=true`),
            fetch(`/api/team-stats/${game.awayTeam.id}?teamName=${encodeURIComponent(game.awayTeam.name)}&checkOnly=true`),
          ]);

          const homeData = homeRes.ok ? await homeRes.json() : null;
          const awayData = awayRes.ok ? await awayRes.json() : null;

          const homeHasStats = homeData?._meta?.matched && (homeData?.games?.length || 0) > 0;
          const awayHasStats = awayData?._meta?.matched && (awayData?.games?.length || 0) > 0;

          return { ...game, hasVerifiedStats: homeHasStats && awayHasStats };
        } catch {
          return { ...game, hasVerifiedStats: false };
        }
      })
    );

    setGames(updatedGames);
    setCheckingStats(false);
  };

  useEffect(() => {
    fetchGames();
  }, []);

  // Check stats when toggle is turned on for the first time
  useEffect(() => {
    if (showOnlyVerified && games.length > 0 && games[0].hasVerifiedStats === undefined) {
      checkStatsAvailability();
    }
  }, [showOnlyVerified, games]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGames();
  };

  const filteredGames = showOnlyVerified
    ? games.filter((g) => g.hasVerifiedStats === true)
    : games;

  const verifiedCount = games.filter((g) => g.hasVerifiedStats === true).length;
  const checkedCount = games.filter((g) => g.hasVerifiedStats !== undefined).length;

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            CBB Predictor
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <span className={refreshing ? 'animate-spin' : ''}>↻</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-gray-600">
            Today&apos;s Games • {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          {/* Verified Stats Toggle */}
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyVerified}
                onChange={(e) => setShowOnlyVerified(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-2 text-sm font-medium text-gray-700">
                Verified Only
                {checkingStats && <span className="ml-1 text-gray-400">(checking...)</span>}
                {!checkingStats && checkedCount > 0 && (
                  <span className="ml-1 text-gray-400">({verifiedCount}/{games.length})</span>
                )}
              </span>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            Loading games...
          </div>
        ) : games.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            No games scheduled for today
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            {checkingStats ? 'Checking stats availability...' : 'No games with verified stats. Try turning off the filter.'}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
