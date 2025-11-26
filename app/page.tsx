'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GameCard } from '@/components/GameCard';
import { Game, PredictionResponse } from '@/lib/types';
import { matchBetToGame } from '@/lib/betParser';
import { getAllFirstHalfPredictions, StoredPrediction } from '@/lib/predictionStorage';
import {
  loadTodaysActiveBets,
  loadBets,
  saveBets,
  clearAllBets,
  removeBet as removeBetFromStorage,
  getUnsettledPastBets,
  StoredBet,
} from '@/lib/betStorage';

interface GameWithStats extends Game {
  hasVerifiedStats?: boolean;
}

// Use StoredBet from betStorage, extend for UI needs
interface ParsedBet extends StoredBet {
  odds?: number;
}

export default function HomePage() {
  const [games, setGames] = useState<GameWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);
  const [showOnlyWithBets, setShowOnlyWithBets] = useState(false);
  const [checkingStats, setCheckingStats] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBetInput, setShowBetInput] = useState(false);
  const [betSlipText, setBetSlipText] = useState('');
  const [bets, setBets] = useState<ParsedBet[]>([]);
  const [parsingBets, setParsingBets] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [cachedPredictions, setCachedPredictions] = useState<Map<string, StoredPrediction>>(new Map());

  // Load cached predictions from localStorage
  useEffect(() => {
    setCachedPredictions(getAllFirstHalfPredictions());
  }, []);

  // Refresh cached predictions when window gains focus (in case batch page updated them)
  useEffect(() => {
    const handleFocus = () => {
      setCachedPredictions(getAllFirstHalfPredictions());
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Load all active bets from localStorage on mount
  useEffect(() => {
    const allBets = loadBets();
    const activeBets = allBets.filter(b => b.status === 'active');
    setBets(activeBets as ParsedBet[]);
  }, []);

  // Note: We don't save bets here anymore - that's handled by betStorage functions
  // The main page only reads active bets for display, dashboard manages full lifecycle

  const handleParseBets = async () => {
    if (!betSlipText.trim()) return;

    setParsingBets(true);
    setParseError(null);

    try {
      const response = await fetch('/api/parse-bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ betSlipText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse bets');
      }

      // Match bets to games
      const matchedBets = data.bets.map((bet: ParsedBet) => ({
        ...bet,
        gameId: matchBetToGame(bet, games),
      }));

      // Save to storage (addBets adds status and createdAt)
      const { addBets } = await import('@/lib/betStorage');
      const savedBets = addBets(matchedBets);

      // Update local state with only active bets
      setBets(savedBets.filter(b => b.status === 'active') as ParsedBet[]);
      setBetSlipText('');
      setShowBetInput(false);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to parse bets');
    } finally {
      setParsingBets(false);
    }
  };

  const clearBets = () => {
    setBets([]);
    clearAllBets();
  };

  const removeBet = (betId: string) => {
    setBets(prev => prev.filter(b => b.id !== betId));
    removeBetFromStorage(betId);
  };

  // Get bets for a specific game
  const getBetsForGame = (gameId: string) => {
    return bets.filter(bet => bet.gameId === gameId);
  };

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

  // Check stats availability for all games using TeamRankings data
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

          // Both teams need to have matched in TeamRankings data
          const homeHasStats = homeData?._meta?.matched === true;
          const awayHasStats = awayData?._meta?.matched === true;

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

  // Get set of game IDs that have bets
  const gameIdsWithBets = new Set(bets.map(b => b.gameId).filter(Boolean));

  const filteredGames = games.filter((g) => {
    const matchesSearch = searchQuery === '' ||
      g.homeTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.awayTeam.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVerified = !showOnlyVerified || g.hasVerifiedStats === true;
    const matchesBets = !showOnlyWithBets || gameIdsWithBets.has(g.id);
    return matchesSearch && matchesVerified && matchesBets;
  });

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
            <Link
              href="/bets"
              className="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors"
            >
              My Bets
            </Link>
            <Link
              href="/batch"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            >
              Batch Predict {cachedPredictions.size > 0 && `(${cachedPredictions.size})`}
            </Link>
            <button
              onClick={() => setShowBetInput(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              + Add Bets {bets.length > 0 && `(${bets.length})`}
            </button>
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

        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800 placeholder-gray-400"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-gray-600">
            Today&apos;s Games • {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          {/* Filter Toggles */}
          <div className="flex items-center gap-4">
            {/* My Bets Filter */}
            {bets.length > 0 && (
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyWithBets}
                  onChange={(e) => setShowOnlyWithBets(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                <span className="ml-2 text-sm font-medium text-gray-700">
                  My Bets
                  <span className="ml-1 text-gray-400">({gameIdsWithBets.size})</span>
                </span>
              </label>
            )}

            {/* Verified Stats Toggle */}
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
            {checkingStats
              ? 'Checking stats availability...'
              : showOnlyWithBets
              ? 'No games match your bets. Try turning off the My Bets filter.'
              : 'No games with verified stats. Try turning off the filter.'}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                bets={getBetsForGame(game.id)}
                cachedPrediction={cachedPredictions.get(game.id) || null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bet Input Modal */}
      {showBetInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">Add Bets</h2>
                <button
                  onClick={() => setShowBetInput(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Paste your bet slip text below. AI will parse teams, lines, and detect 1H vs full game.
              </p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <textarea
                value={betSlipText}
                onChange={(e) => setBetSlipText(e.target.value)}
                placeholder={`Paste your bets here...

Example format:
11/25/25
5:37 PM
Placed - Single
To Win $ 1.82
Under 70 (-110)
(6555) Chicago State @ (6556) IPFW`}
                className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 font-mono text-sm"
              />

              {parseError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {parseError}
                </div>
              )}

              {/* Current Bets Preview */}
              {bets.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700">Current Bets ({bets.length})</h3>
                    <button
                      onClick={clearBets}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {bets.map((bet) => (
                      <div
                        key={bet.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-800">
                            {bet.betType === 'spread' && bet.team
                              ? `${bet.team} ${bet.line! > 0 ? '+' : ''}${bet.line}`
                              : `${bet.betType.charAt(0).toUpperCase() + bet.betType.slice(1)} ${bet.line}`}
                          </span>
                          <span className="text-gray-500 ml-2">
                            ({bet.half === 'full' ? 'Game' : bet.half})
                          </span>
                          <div className="text-xs text-gray-400">
                            {bet.awayTeam} @ {bet.homeTeam}
                            {bet.gameId ? (
                              <span className="text-green-600 ml-1">Matched</span>
                            ) : (
                              <span className="text-orange-500 ml-1">Not matched</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeBet(bet.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowBetInput(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleParseBets}
                disabled={parsingBets || !betSlipText.trim()}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {parsingBets ? 'Parsing with AI...' : 'Parse Bets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
