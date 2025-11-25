'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Game, LocationType, PredictionResponse } from '@/lib/types';
import { PredictionPanel } from '@/components/PredictionPanel';
import { GameChat } from '@/components/GameChat';

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

  useEffect(() => {
    // Fetch game data from localStorage or API
    const fetchGame = async () => {
      try {
        // For now, fetch from server-side cached data
        const res = await fetch(`/api/game/${gameId}`);
        if (!res.ok) throw new Error('Game not found');
        const data = await res.json();
        setGame(data);
      } catch (err) {
        console.error('Failed to fetch game:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [gameId]);

  const handleLocationChange = (newLocation: LocationType) => {
    if (game) {
      setGame({ ...game, location: newLocation });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading game...</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Game not found</h2>
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 hover:underline"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const gameDate = new Date(game.date);

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push('/')}
          className="mb-6 text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to Games
        </button>

        {/* Game Header */}
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-500">
              {gameDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>

            {/* Neutral Site Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-600">Neutral Site</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={game.location === 'neutral'}
                  onChange={(e) => handleLocationChange(e.target.checked ? 'neutral' : 'home')}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
              </div>
            </label>
          </div>

          {/* Teams */}
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b">
              <div className="flex items-center gap-3">
                {game.awayTeam.rank && (
                  <span className="text-lg font-bold text-gray-500">
                    #{game.awayTeam.rank}
                  </span>
                )}
                <span className="text-2xl font-semibold">{game.awayTeam.name}</span>
              </div>
              {game.awayScore !== undefined && (
                <span className="text-3xl font-bold">{game.awayScore}</span>
              )}
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {game.homeTeam.rank && (
                  <span className="text-lg font-bold text-gray-500">
                    #{game.homeTeam.rank}
                  </span>
                )}
                <span className="text-2xl font-semibold">{game.homeTeam.name}</span>
              </div>
              {game.homeScore !== undefined && (
                <span className="text-3xl font-bold">{game.homeScore}</span>
              )}
            </div>
          </div>
        </div>

        {/* Prediction Panel */}
        <PredictionPanel game={game} onPredictionUpdate={setPrediction} />

        {/* Game Chat */}
        <div className="mt-6">
          <GameChat game={game} prediction={prediction} />
        </div>
      </div>
    </main>
  );
}
