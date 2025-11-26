'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Game, PredictionResponse } from '@/lib/types';
import { BatchGameRow } from '@/components/BatchGameRow';
import {
  storePrediction,
  getCachedPrediction,
  getAllFirstHalfPredictions,
  clearAllPredictions,
  StoredPrediction,
} from '@/lib/predictionStorage';
import {
  storeTeamAlias,
  getTeamAlias,
  loadTeamAliases,
} from '@/lib/teamAliasStorage';

interface GameState {
  isSelected: boolean;
  isNeutral: boolean;
}

interface TeamMatchStatus {
  matched: boolean;
  matchedName?: string;
  matchConfidence?: number;
  suggestions?: Array<{ name: string; score: number }>;
}

interface TeamOverrides {
  [gameId: string]: {
    home?: string;
    away?: string;
  };
}

interface TeamStatuses {
  [gameId: string]: {
    home: TeamMatchStatus | null;
    away: TeamMatchStatus | null;
  };
}

export default function BatchPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameStates, setGameStates] = useState<Map<string, GameState>>(new Map());
  const [cachedPredictions, setCachedPredictions] = useState<Map<string, StoredPrediction>>(
    new Map()
  );

  // Batch processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingId, setCurrentProcessingId] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Team matching state
  const [teamStatuses, setTeamStatuses] = useState<TeamStatuses>({});
  const [teamOverrides, setTeamOverrides] = useState<TeamOverrides>({});
  const [loadingTeamStatus, setLoadingTeamStatus] = useState(false);

  // Load games
  useEffect(() => {
    async function loadGames() {
      try {
        const response = await fetch('/api/games');
        const data = await response.json();
        // API returns array directly, not {games: [...]}
        const gamesList: Game[] = Array.isArray(data) ? data : [];
        setGames(gamesList);

        // Initialize game states (all unselected, not neutral by default)
        const initialStates = new Map<string, GameState>();
        gamesList.forEach((game: Game) => {
          initialStates.set(game.id, {
            isSelected: false,
            isNeutral: false,
          });
        });
        setGameStates(initialStates);
      } catch (error) {
        console.error('Failed to load games:', error);
      } finally {
        setLoading(false);
      }
    }

    loadGames();
  }, []);

  // Load cached predictions
  useEffect(() => {
    setCachedPredictions(getAllFirstHalfPredictions());
  }, []);

  // Refresh cached predictions after processing
  const refreshCachedPredictions = useCallback(() => {
    setCachedPredictions(getAllFirstHalfPredictions());
  }, []);

  // Fetch team match status for a single team
  const fetchTeamStatus = useCallback(async (
    teamId: string,
    teamName: string,
    aliasOverride?: string
  ): Promise<TeamMatchStatus | null> => {
    try {
      const nameToCheck = aliasOverride || teamName;
      const response = await fetch(
        `/api/team-stats/${teamId}?teamName=${encodeURIComponent(nameToCheck)}&checkOnly=true`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return {
        matched: data._meta?.matched ?? false,
        matchedName: data._meta?.matchedName,
        matchConfidence: data._meta?.matchConfidence,
        suggestions: data.suggestions,
      };
    } catch {
      return null;
    }
  }, []);

  // Fetch team statuses for all games
  useEffect(() => {
    if (games.length === 0) return;

    const fetchAllTeamStatuses = async () => {
      setLoadingTeamStatus(true);
      const aliases = loadTeamAliases();
      const newStatuses: TeamStatuses = {};
      const newOverrides: TeamOverrides = {};

      // Process games in batches of 5 for better performance
      const BATCH_SIZE = 5;
      for (let i = 0; i < games.length; i += BATCH_SIZE) {
        const batch = games.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (game) => {
            // Check for existing aliases
            const homeAlias = getTeamAlias(game.homeTeam.name);
            const awayAlias = getTeamAlias(game.awayTeam.name);

            // If we have aliases, set them as overrides
            if (homeAlias || awayAlias) {
              newOverrides[game.id] = {
                home: homeAlias || undefined,
                away: awayAlias || undefined,
              };
            }

            // Fetch status (use alias if available)
            const [homeStatus, awayStatus] = await Promise.all([
              fetchTeamStatus(game.homeTeam.id, game.homeTeam.name, homeAlias || undefined),
              fetchTeamStatus(game.awayTeam.id, game.awayTeam.name, awayAlias || undefined),
            ]);

            newStatuses[game.id] = {
              home: homeStatus,
              away: awayStatus,
            };
          })
        );
      }

      setTeamStatuses(newStatuses);
      setTeamOverrides(newOverrides);
      setLoadingTeamStatus(false);
    };

    fetchAllTeamStatuses();
  }, [games, fetchTeamStatus]);

  // Handle team correction from dropdown
  const handleTeamCorrect = useCallback(async (
    gameId: string,
    isHome: boolean,
    correctedName: string,
    originalName: string
  ) => {
    // Store the alias for future use
    storeTeamAlias(originalName, correctedName);

    // Update local override state
    setTeamOverrides((prev) => ({
      ...prev,
      [gameId]: {
        ...prev[gameId],
        [isHome ? 'home' : 'away']: correctedName,
      },
    }));

    // Re-fetch status for this team
    const game = games.find((g) => g.id === gameId);
    if (!game) return;

    const teamId = isHome ? game.homeTeam.id : game.awayTeam.id;
    const newStatus = await fetchTeamStatus(teamId, correctedName);

    setTeamStatuses((prev) => ({
      ...prev,
      [gameId]: {
        ...prev[gameId],
        [isHome ? 'home' : 'away']: newStatus,
      },
    }));
  }, [games, fetchTeamStatus]);

  // Handle selection change
  const handleSelectChange = (gameId: string, selected: boolean) => {
    setGameStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(gameId) || { isSelected: false, isNeutral: false };
      newMap.set(gameId, { ...current, isSelected: selected });
      return newMap;
    });
  };

  // Handle neutral change
  const handleNeutralChange = (gameId: string, neutral: boolean) => {
    setGameStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(gameId) || { isSelected: false, isNeutral: false };
      newMap.set(gameId, { ...current, isNeutral: neutral });
      return newMap;
    });
  };

  // Select all games
  const handleSelectAll = () => {
    setGameStates((prev) => {
      const newMap = new Map(prev);
      games.forEach((game) => {
        const current = newMap.get(game.id) || { isSelected: false, isNeutral: false };
        newMap.set(game.id, { ...current, isSelected: true });
      });
      return newMap;
    });
  };

  // Select only games without predictions
  const handleSelectUnpredicted = () => {
    setGameStates((prev) => {
      const newMap = new Map(prev);
      games.forEach((game) => {
        const hasPrediction = cachedPredictions.has(game.id);
        const current = newMap.get(game.id) || { isSelected: false, isNeutral: false };
        newMap.set(game.id, { ...current, isSelected: !hasPrediction });
      });
      return newMap;
    });
  };

  // Deselect all games
  const handleDeselectAll = () => {
    setGameStates((prev) => {
      const newMap = new Map(prev);
      games.forEach((game) => {
        const current = newMap.get(game.id) || { isSelected: false, isNeutral: false };
        newMap.set(game.id, { ...current, isSelected: false });
      });
      return newMap;
    });
  };

  // Get selected games
  const selectedGames = games.filter((game) => gameStates.get(game.id)?.isSelected);
  const selectedCount = selectedGames.length;

  // Process predictions sequentially
  const handleBatchPredict = async () => {
    if (selectedCount === 0) return;

    setIsProcessing(true);
    setProcessedCount(0);
    setTotalToProcess(selectedCount);
    setErrors(new Map());

    for (let i = 0; i < selectedGames.length; i++) {
      const game = selectedGames[i];
      const state = gameStates.get(game.id);
      const overrides = teamOverrides[game.id];

      // NOTE: We no longer skip already-predicted games - user explicitly selected them
      // This allows re-predicting games to get fresh predictions

      setCurrentProcessingId(game.id);

      try {
        const response = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            half: '1st',
            isNeutralSite: state?.isNeutral || false,
            // Pass team name overrides if user corrected them
            homeTeamOverride: overrides?.home || undefined,
            awayTeamOverride: overrides?.away || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Prediction failed');
        }

        const prediction: PredictionResponse = await response.json();

        // Store in localStorage
        storePrediction(game.id, '1st', prediction, state?.isNeutral || false);

        // Deselect processed game
        handleSelectChange(game.id, false);
      } catch (error) {
        console.error(`Failed to predict game ${game.id}:`, error);
        setErrors((prev) => {
          const newMap = new Map(prev);
          newMap.set(game.id, error instanceof Error ? error.message : 'Unknown error');
          return newMap;
        });
      }

      setProcessedCount((prev) => prev + 1);

      // Small delay between requests to be nice to the API
      if (i < selectedGames.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setCurrentProcessingId(null);
    setIsProcessing(false);
    refreshCachedPredictions();
  };

  // Clear all cached predictions
  const handleClearAll = () => {
    if (confirm('Clear all cached predictions?')) {
      clearAllPredictions();
      setCachedPredictions(new Map());
    }
  };

  // Filter for games that haven't started (scheduled)
  const scheduledGames = games.filter((g) => g.status === 'scheduled');
  const predictedCount = cachedPredictions.size;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading games...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
              ← Back to Games
            </Link>
            <h1 className="text-2xl font-bold">Batch 1st Half Predictions</h1>
            <p className="text-gray-400 text-sm mt-1">
              Select games and generate predictions in bulk
            </p>
          </div>

          <div className="text-right">
            <div className="text-sm text-gray-400">
              {predictedCount} of {scheduledGames.length} predicted
            </div>
            {predictedCount > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-300 mt-1"
              >
                Clear all cached
              </button>
            )}
          </div>
        </div>

        {/* Selection Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-800 rounded-lg">
          <button
            onClick={handleSelectAll}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
          >
            Select All
          </button>
          <button
            onClick={handleSelectUnpredicted}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
          >
            Select Unpredicted
          </button>
          <button
            onClick={handleDeselectAll}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
          >
            Deselect All
          </button>

          <div className="flex-1" />

          <span className="text-sm text-gray-400">{selectedCount} selected</span>

          <button
            onClick={handleBatchPredict}
            disabled={isProcessing || selectedCount === 0}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : `Predict ${selectedCount} Games`}
          </button>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">
                Processing game {processedCount + 1} of {totalToProcess}
              </span>
              <span className="text-sm text-gray-400">
                {Math.round((processedCount / totalToProcess) * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(processedCount / totalToProcess) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Summary */}
        {errors.size > 0 && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
            <div className="text-sm text-red-400 font-medium mb-1">
              {errors.size} prediction{errors.size > 1 ? 's' : ''} failed
            </div>
            <div className="text-xs text-red-300/70">
              {Array.from(errors.values())
                .slice(0, 3)
                .join(', ')}
              {errors.size > 3 && ` and ${errors.size - 3} more`}
            </div>
          </div>
        )}

        {/* Team Status Loading */}
        {loadingTeamStatus && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Checking team availability...</span>
            </div>
          </div>
        )}

        {/* Unmatched Teams Summary */}
        {!loadingTeamStatus && Object.keys(teamStatuses).length > 0 && (
          () => {
            const unmatchedGames = scheduledGames.filter((game) => {
              const status = teamStatuses[game.id];
              return status && (!status.home?.matched || !status.away?.matched);
            });
            if (unmatchedGames.length === 0) return null;
            return (
              <div className="mb-4 p-3 bg-orange-900/30 border border-orange-500/50 rounded-lg">
                <div className="text-sm text-orange-400 font-medium mb-1">
                  {unmatchedGames.length} game{unmatchedGames.length > 1 ? 's' : ''} with unmatched teams
                </div>
                <div className="text-xs text-orange-300/70">
                  Click the ⚠️ icon next to team names to select the correct match
                </div>
              </div>
            );
          }
        )()}

        {/* Games List */}
        <div className="space-y-2">
          {scheduledGames.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No scheduled games found for today
            </div>
          ) : (
            scheduledGames.map((game) => (
              <BatchGameRow
                key={game.id}
                game={game}
                isSelected={gameStates.get(game.id)?.isSelected || false}
                isNeutral={gameStates.get(game.id)?.isNeutral || false}
                onSelectChange={(selected) => handleSelectChange(game.id, selected)}
                onNeutralChange={(neutral) => handleNeutralChange(game.id, neutral)}
                cachedPrediction={cachedPredictions.get(game.id) || null}
                isProcessing={currentProcessingId === game.id}
                homeTeamStatus={teamStatuses[game.id]?.home}
                awayTeamStatus={teamStatuses[game.id]?.away}
                homeTeamOverride={teamOverrides[game.id]?.home}
                awayTeamOverride={teamOverrides[game.id]?.away}
                onHomeTeamCorrect={(name) => handleTeamCorrect(game.id, true, name, game.homeTeam.name)}
                onAwayTeamCorrect={(name) => handleTeamCorrect(game.id, false, name, game.awayTeam.name)}
              />
            ))
          )}
        </div>

        {/* Games in progress / final (info only) */}
        {games.filter((g) => g.status !== 'scheduled').length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-400 mb-3">
              In Progress / Completed ({games.filter((g) => g.status !== 'scheduled').length})
            </h2>
            <div className="space-y-2 opacity-60">
              {games
                .filter((g) => g.status !== 'scheduled')
                .map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 bg-gray-800/30"
                  >
                    <div className="flex-1">
                      <span className="text-gray-300">
                        {game.awayTeam.shortName || game.awayTeam.name}
                      </span>
                      <span className="text-gray-500 mx-2">@</span>
                      <span className="text-gray-300">
                        {game.homeTeam.shortName || game.homeTeam.name}
                      </span>
                    </div>
                    <span className="text-xs text-orange-400 uppercase">{game.status}</span>
                    {game.homeScore !== undefined && game.awayScore !== undefined && (
                      <span className="font-mono text-sm">
                        {game.awayScore} - {game.homeScore}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
