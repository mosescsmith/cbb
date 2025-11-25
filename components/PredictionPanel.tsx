'use client';

import { useState, useEffect, useCallback } from 'react';
import { Game, PredictionResponse } from '@/lib/types';
import { debugLogger } from '@/lib/debugLogger';
import { DebugPanel } from './DebugPanel';
import { TeamStatsMissing } from './TeamStatsMissing';

type HalfType = '1st' | '2nd';

interface TeamSuggestion {
  teamId: string;
  teamName: string;
  similarity: number;
  gamesCount: number;
}

interface TeamStatsStatus {
  matched: boolean;
  stale: boolean;
  gamesCount: number;
  suggestions?: TeamSuggestion[];
  // Extended stats for preview
  seasonAverages?: {
    firstHalf: { scored: number; allowed: number };
    secondHalf: { scored: number; allowed: number };
  };
  last5Averages?: {
    firstHalf: { scored: number; allowed: number };
    secondHalf: { scored: number; allowed: number };
  };
}

interface PredictionPanelProps {
  game: Game;
  onPredictionUpdate?: (prediction: PredictionResponse | null) => void;
}

export function PredictionPanel({ game, onPredictionUpdate }: PredictionPanelProps) {
  const [selectedHalf, setSelectedHalf] = useState<HalfType>('1st');
  const [halftimeHomeScore, setHalftimeHomeScore] = useState('');
  const [halftimeAwayScore, setHalftimeAwayScore] = useState('');
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [fetchingHalftime, setFetchingHalftime] = useState(false);

  // Team stats status
  const [homeStatsStatus, setHomeStatsStatus] = useState<TeamStatsStatus | null>(null);
  const [awayStatsStatus, setAwayStatsStatus] = useState<TeamStatsStatus | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Team overrides (when user selects a suggestion)
  const [homeTeamOverride, setHomeTeamOverride] = useState<{ id: string; name: string } | null>(null);
  const [awayTeamOverride, setAwayTeamOverride] = useState<{ id: string; name: string } | null>(null);

  // Load debug preference on mount
  useEffect(() => {
    setDebugEnabled(debugLogger.isDebugEnabled());
  }, []);

  // Fetch team stats on mount (lazy loading - fetches from NCAA API if needed)
  const fetchTeamStatsStatus = useCallback(async (teamId: string, teamName: string): Promise<TeamStatsStatus | null> => {
    try {
      // Lazy fetch - will pull from NCAA API if not cached
      const response = await fetch(`/api/team-stats/${teamId}?teamName=${encodeURIComponent(teamName)}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        matched: data._meta?.matched ?? true,
        stale: data._meta?.stale ?? false,
        gamesCount: data.games?.length ?? 0,
        suggestions: data._meta?.suggestions,
        seasonAverages: data.seasonAverages,
        last5Averages: data.last5Averages,
      };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const loadStatsStatus = async () => {
      setLoadingStats(true);
      const [homeStatus, awayStatus] = await Promise.all([
        fetchTeamStatsStatus(game.homeTeam.id, game.homeTeam.name),
        fetchTeamStatsStatus(game.awayTeam.id, game.awayTeam.name),
      ]);
      setHomeStatsStatus(homeStatus);
      setAwayStatsStatus(awayStatus);
      setLoadingStats(false);
    };
    loadStatsStatus();
  }, [game.homeTeam.id, game.homeTeam.name, game.awayTeam.id, game.awayTeam.name, fetchTeamStatsStatus]);

  // Reset state when tab switches
  useEffect(() => {
    setPrediction(null);
    setError(null);
    setHalftimeHomeScore('');
    setHalftimeAwayScore('');
    onPredictionUpdate?.(null);
  }, [selectedHalf, onPredictionUpdate]);

  // Auto-fetch halftime scores when switching to 2nd half
  useEffect(() => {
    if (selectedHalf === '2nd' && game.halftimeHomeScore && game.halftimeAwayScore) {
      setHalftimeHomeScore(game.halftimeHomeScore.toString());
      setHalftimeAwayScore(game.halftimeAwayScore.toString());
    }
  }, [selectedHalf, game.halftimeHomeScore, game.halftimeAwayScore]);

  // Handle selecting a suggested team
  const handleSelectHomeTeam = async (teamId: string, teamName: string) => {
    setHomeTeamOverride({ id: teamId, name: teamName });
    // Fetch new stats status for the selected team
    const status = await fetchTeamStatsStatus(teamId, teamName);
    if (status) {
      setHomeStatsStatus({ ...status, matched: true });
    }
    if (debugEnabled) {
      debugLogger.info(`Home team override: ${teamName} (${teamId})`);
    }
  };

  const handleSelectAwayTeam = async (teamId: string, teamName: string) => {
    setAwayTeamOverride({ id: teamId, name: teamName });
    // Fetch new stats status for the selected team
    const status = await fetchTeamStatsStatus(teamId, teamName);
    if (status) {
      setAwayStatsStatus({ ...status, matched: true });
    }
    if (debugEnabled) {
      debugLogger.info(`Away team override: ${teamName} (${teamId})`);
    }
  };

  const fetchHalftimeScores = async () => {
    setFetchingHalftime(true);
    setError(null);

    try {
      const response = await fetch(`/api/game/${game.id}`);
      if (!response.ok) throw new Error('Failed to fetch game details');

      const gameData = await response.json();

      if (gameData.halftimeHomeScore && gameData.halftimeAwayScore) {
        setHalftimeHomeScore(gameData.halftimeHomeScore.toString());
        setHalftimeAwayScore(gameData.halftimeAwayScore.toString());
        if (debugEnabled) {
          debugLogger.success('Auto-fetched halftime scores', {
            home: gameData.halftimeHomeScore,
            away: gameData.halftimeAwayScore,
          });
        }
      } else {
        throw new Error('Halftime scores not available yet');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch halftime scores';
      setError(errorMsg);
      if (debugEnabled) {
        debugLogger.error('Failed to fetch halftime scores', { error: errorMsg });
      }
    } finally {
      setFetchingHalftime(false);
    }
  };

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    setPrediction(null);

    const startTime = Date.now();

    if (debugEnabled) {
      debugLogger.info(`Starting ${selectedHalf} half prediction for ${game.awayTeam.name} @ ${game.homeTeam.name}`);
    }

    try {
      // Validate 2nd half inputs
      if (selectedHalf === '2nd') {
        const homeScore = parseInt(halftimeHomeScore);
        const awayScore = parseInt(halftimeAwayScore);

        if (isNaN(homeScore) || isNaN(awayScore)) {
          throw new Error('Please enter valid halftime scores');
        }

        if (debugEnabled) {
          debugLogger.info(`Halftime scores: ${game.awayTeam.name} ${awayScore}, ${game.homeTeam.name} ${homeScore}`);
        }
      }

      if (debugEnabled) {
        debugLogger.info('Sending prediction request to API...');
      }

      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          half: selectedHalf,
          halftimeHomeScore: selectedHalf === '2nd' ? parseInt(halftimeHomeScore) : undefined,
          halftimeAwayScore: selectedHalf === '2nd' ? parseInt(halftimeAwayScore) : undefined,
          debug: debugEnabled,
        }),
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json();
        if (debugEnabled) {
          debugLogger.error(`Prediction failed after ${(elapsed / 1000).toFixed(2)}s`, errorData);
        }
        throw new Error(errorData.error || 'Prediction failed');
      }

      const data = await response.json();

      if (debugEnabled) {
        debugLogger.success(`Prediction received in ${(elapsed / 1000).toFixed(2)}s`, {
          homeScore: data.homeScore,
          awayScore: data.awayScore,
          confidence: data.confidence,
          model: data._meta?.model,
        });
      }

      setPrediction(data);
      onPredictionUpdate?.(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);

      if (debugEnabled) {
        debugLogger.error('Prediction error', { error: errorMsg });
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleDebug = () => {
    const newValue = !debugEnabled;
    setDebugEnabled(newValue);
    debugLogger.setDebugEnabled(newValue);
  };

  return (
    <>
      <div className="bg-white rounded-lg p-6 shadow-sm">
        {/* Header with Debug Toggle */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Prediction</h2>
          <button
            onClick={toggleDebug}
            className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-colors ${
              debugEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>🔍</span>
            <span>{debugEnabled ? 'Debug ON' : 'Debug OFF'}</span>
          </button>
        </div>

        {/* Toggle Tabs */}
        <div className="flex border-b mb-6">
        <button
          onClick={() => setSelectedHalf('1st')}
          className={`flex-1 py-3 font-semibold transition-colors ${
            selectedHalf === '1st'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          1st Half
        </button>
        <button
          onClick={() => setSelectedHalf('2nd')}
          className={`flex-1 py-3 font-semibold transition-colors ${
            selectedHalf === '2nd'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          2nd Half
        </button>
      </div>

      {/* Team Stats Warnings */}
      {!loadingStats && (
        <div className="space-y-3 mb-6">
          {/* Home Team */}
          {homeStatsStatus && !homeStatsStatus.matched && !homeTeamOverride && (
            <TeamStatsMissing
              teamName={game.homeTeam.name}
              teamId={game.homeTeam.id}
              suggestions={homeStatsStatus.suggestions}
              onSelectTeam={handleSelectHomeTeam}
              isLoading={loading}
            />
          )}
          {homeTeamOverride && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span className="text-sm text-green-800">
                  Using <strong>{homeTeamOverride.name}</strong> stats for {game.homeTeam.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setHomeTeamOverride(null);
                  // Re-fetch original team status
                  fetchTeamStatsStatus(game.homeTeam.id, game.homeTeam.name).then(setHomeStatsStatus);
                }}
                className="text-xs text-green-600 hover:text-green-800 underline"
              >
                Reset
              </button>
            </div>
          )}

          {/* Away Team */}
          {awayStatsStatus && !awayStatsStatus.matched && !awayTeamOverride && (
            <TeamStatsMissing
              teamName={game.awayTeam.name}
              teamId={game.awayTeam.id}
              suggestions={awayStatsStatus.suggestions}
              onSelectTeam={handleSelectAwayTeam}
              isLoading={loading}
            />
          )}
          {awayTeamOverride && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span className="text-sm text-green-800">
                  Using <strong>{awayTeamOverride.name}</strong> stats for {game.awayTeam.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setAwayTeamOverride(null);
                  // Re-fetch original team status
                  fetchTeamStatsStatus(game.awayTeam.id, game.awayTeam.name).then(setAwayStatsStatus);
                }}
                className="text-xs text-green-600 hover:text-green-800 underline"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      {loadingStats && (
        <div className="mb-6 text-center text-sm text-gray-500">
          Checking team stats availability...
        </div>
      )}

      {/* Stats Preview - Always visible when we have status */}
      {!loadingStats && (homeStatsStatus || awayStatsStatus) && (
        <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">Team Stats Preview</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Away Team Stats */}
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">{game.awayTeam.name}</div>
              {awayStatsStatus?.matched && awayStatsStatus.gamesCount > 0 ? (
                <div>
                  <div className="text-lg font-bold text-green-600">{awayStatsStatus.gamesCount} games</div>
                  {awayStatsStatus.seasonAverages && (
                    <div className="text-xs text-gray-600 mt-1">
                      1H: {awayStatsStatus.seasonAverages.firstHalf.scored.toFixed(1)} pts |
                      2H: {awayStatsStatus.seasonAverages.secondHalf.scored.toFixed(1)} pts
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-lg font-bold text-red-500">No data</div>
              )}
            </div>
            {/* Home Team Stats */}
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">{game.homeTeam.name}</div>
              {homeStatsStatus?.matched && homeStatsStatus.gamesCount > 0 ? (
                <div>
                  <div className="text-lg font-bold text-green-600">{homeStatsStatus.gamesCount} games</div>
                  {homeStatsStatus.seasonAverages && (
                    <div className="text-xs text-gray-600 mt-1">
                      1H: {homeStatsStatus.seasonAverages.firstHalf.scored.toFixed(1)} pts |
                      2H: {homeStatsStatus.seasonAverages.secondHalf.scored.toFixed(1)} pts
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-lg font-bold text-red-500">No data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2nd Half Inputs */}
      {selectedHalf === '2nd' && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">Halftime Score</h3>
            <button
              onClick={fetchHalftimeScores}
              disabled={fetchingHalftime}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              {fetchingHalftime ? 'Loading...' : 'Auto-Fill'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {game.awayTeam.name}
              </label>
              <input
                type="number"
                value={halftimeAwayScore}
                onChange={(e) => setHalftimeAwayScore(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {game.homeTeam.name}
              </label>
              <input
                type="number"
                value={halftimeHomeScore}
                onChange={(e) => setHalftimeHomeScore(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Predict Button */}
      <button
        onClick={handlePredict}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Predicting...' : 'Get Prediction'}
      </button>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Prediction Result */}
      {prediction && (
        <div className="mt-6 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-gray-800 mb-4">
            {selectedHalf === '1st' ? 'Predicted 1st Half Score' : 'Predicted Final Score'}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-sm text-gray-600 mb-1">{game.awayTeam.name}</div>
              <div className="text-3xl font-bold text-gray-900">{prediction.awayScore}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">{game.homeTeam.name}</div>
              <div className="text-3xl font-bold text-gray-900">{prediction.homeScore}</div>
            </div>
          </div>

          {/* 2nd Half Only Projection */}
          {selectedHalf === '2nd' && halftimeHomeScore && halftimeAwayScore && (
            <>
              <div className="mt-6 pt-4 border-t border-blue-300">
                <h4 className="font-semibold text-gray-700 mb-3 text-center">2nd Half Only</h4>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{game.awayTeam.name}</div>
                    <div className="text-2xl font-bold text-blue-700">
                      +{prediction.awayScore - parseInt(halftimeAwayScore)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{game.homeTeam.name}</div>
                    <div className="text-2xl font-bold text-blue-700">
                      +{prediction.homeScore - parseInt(halftimeHomeScore)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {prediction.confidence && (
            <div className="mt-4 text-center text-sm text-gray-600">
              Confidence: {(prediction.confidence * 100).toFixed(0)}%
            </div>
          )}
          {prediction.reasoning && (
            <div className="mt-4 text-sm text-gray-700 italic">
              {prediction.reasoning}
            </div>
          )}
          {prediction._meta && (
            <div className="mt-4 pt-4 border-t border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Model: <span className="font-semibold text-blue-600">{prediction._meta.model}</span></span>
                <span>Time: {prediction._meta.totalTime}</span>
              </div>
              {prediction._meta.stats && (
                <div className="flex items-center justify-between text-xs">
                  <span className={prediction._meta.stats.away?.games > 0 ? 'text-green-600' : 'text-orange-500'}>
                    {game.awayTeam.name}: {prediction._meta.stats.away?.games || 0} games
                  </span>
                  <span className={prediction._meta.stats.home?.games > 0 ? 'text-green-600' : 'text-orange-500'}>
                    {game.homeTeam.name}: {prediction._meta.stats.home?.games || 0} games
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Debug Panel */}
      {debugEnabled && <DebugPanel />}
    </>
  );
}
