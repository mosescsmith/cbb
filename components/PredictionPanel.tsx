'use client';

import { useState, useEffect, useCallback } from 'react';
import { Game, PredictionResponse } from '@/lib/types';
import { debugLogger } from '@/lib/debugLogger';
import { DebugPanel } from './DebugPanel';
import { TeamSelector } from './TeamSelector';
type HalfType = '1st' | '2nd';

interface TeamSuggestion {
  name: string;
  score: number;
}

interface TeamStatsStatus {
  matched: boolean;
  stale: boolean;
  matchedName?: string;
  matchConfidence?: number;
  suggestions?: TeamSuggestion[];
  // TeamRankings stats
  seasonAverages?: {
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

  // Team name overrides (when user selects from fuzzy suggestions)
  const [homeTeamOverride, setHomeTeamOverride] = useState<string | null>(null);
  const [awayTeamOverride, setAwayTeamOverride] = useState<string | null>(null);

  // Edit mode for matched teams (to allow changing even auto-matched teams)
  const [editingHomeTeam, setEditingHomeTeam] = useState(false);
  const [editingAwayTeam, setEditingAwayTeam] = useState(false);

  // Load debug preference on mount
  useEffect(() => {
    setDebugEnabled(debugLogger.isDebugEnabled());
  }, []);

  // Fetch team stats status from TeamRankings CSV data
  const fetchTeamStatsStatus = useCallback(async (teamId: string, teamName: string): Promise<TeamStatsStatus | null> => {
    try {
      const response = await fetch(`/api/team-stats/${teamId}?teamName=${encodeURIComponent(teamName)}&checkOnly=true`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        matched: data._meta?.matched ?? false,
        stale: data._meta?.stale ?? false,
        matchedName: data._meta?.matchedName,
        matchConfidence: data._meta?.matchConfidence,
        suggestions: data.suggestions,
        seasonAverages: data.seasonAverages,
      };
    } catch {
      return null;
    }
  }, []);

  // Handler when user selects a team from suggestions
  const handleTeamSelect = useCallback(async (
    isHome: boolean,
    selectedTeamName: string,
    teamId: string
  ) => {
    // Set the override and exit edit mode
    if (isHome) {
      setHomeTeamOverride(selectedTeamName);
      setEditingHomeTeam(false);
    } else {
      setAwayTeamOverride(selectedTeamName);
      setEditingAwayTeam(false);
    }

    // Re-fetch stats with the selected team name
    const status = await fetchTeamStatsStatus(teamId, selectedTeamName);
    if (status) {
      if (isHome) {
        setHomeStatsStatus(status);
      } else {
        setAwayStatsStatus(status);
      }
    }
  }, [fetchTeamStatsStatus]);

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
          // Pass team name overrides if user selected from suggestions
          homeTeamOverride: homeTeamOverride || undefined,
          awayTeamOverride: awayTeamOverride || undefined,
          // Pass neutral site setting from client (user may have toggled it)
          isNeutralSite: game.location === 'neutral',
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

      {loadingStats && (
        <div className="mb-6 text-center text-sm text-gray-500">
          Checking team stats availability...
        </div>
      )}

      {/* Stats Preview - Always visible when we have status */}
      {!loadingStats && (homeStatsStatus || awayStatsStatus) && (
        <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">Team Stats (TeamRankings)</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Away Team Stats */}
            <div>
              <div className="text-xs text-gray-500 mb-1 text-center">{game.awayTeam.name}</div>
              {editingAwayTeam ? (
                <TeamSelector
                  teamName={awayStatsStatus?.matchedName || game.awayTeam.name}
                  teamId={game.awayTeam.id}
                  suggestions={[]}
                  onSelect={(name) => handleTeamSelect(false, name, game.awayTeam.id)}
                  disabled={loading}
                />
              ) : awayStatsStatus?.matched ? (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-green-600">✓ Found</span>
                    <button
                      onClick={() => setEditingAwayTeam(true)}
                      disabled={loading}
                      className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                    >
                      Edit
                    </button>
                  </div>
                  {awayStatsStatus.matchedName && awayStatsStatus.matchedName !== game.awayTeam.name && (
                    <div className="text-xs text-gray-500">as &quot;{awayStatsStatus.matchedName}&quot;</div>
                  )}
                  {awayStatsStatus.seasonAverages && (
                    <div className="text-xs text-gray-600 mt-1">
                      1H: {awayStatsStatus.seasonAverages.firstHalf.scored.toFixed(1)} PPG |
                      2H: {awayStatsStatus.seasonAverages.secondHalf.scored.toFixed(1)} PPG
                    </div>
                  )}
                </div>
              ) : awayStatsStatus?.suggestions && awayStatsStatus.suggestions.length > 0 ? (
                <TeamSelector
                  teamName={game.awayTeam.name}
                  teamId={game.awayTeam.id}
                  suggestions={awayStatsStatus.suggestions}
                  onSelect={(name) => handleTeamSelect(false, name, game.awayTeam.id)}
                  disabled={loading}
                />
              ) : (
                <div className="text-sm font-bold text-red-500 text-center">Not found</div>
              )}
            </div>
            {/* Home Team Stats */}
            <div>
              <div className="text-xs text-gray-500 mb-1 text-center">{game.homeTeam.name}</div>
              {editingHomeTeam ? (
                <TeamSelector
                  teamName={homeStatsStatus?.matchedName || game.homeTeam.name}
                  teamId={game.homeTeam.id}
                  suggestions={[]}
                  onSelect={(name) => handleTeamSelect(true, name, game.homeTeam.id)}
                  disabled={loading}
                />
              ) : homeStatsStatus?.matched ? (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-green-600">✓ Found</span>
                    <button
                      onClick={() => setEditingHomeTeam(true)}
                      disabled={loading}
                      className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                    >
                      Edit
                    </button>
                  </div>
                  {homeStatsStatus.matchedName && homeStatsStatus.matchedName !== game.homeTeam.name && (
                    <div className="text-xs text-gray-500">as &quot;{homeStatsStatus.matchedName}&quot;</div>
                  )}
                  {homeStatsStatus.seasonAverages && (
                    <div className="text-xs text-gray-600 mt-1">
                      1H: {homeStatsStatus.seasonAverages.firstHalf.scored.toFixed(1)} PPG |
                      2H: {homeStatsStatus.seasonAverages.secondHalf.scored.toFixed(1)} PPG
                    </div>
                  )}
                </div>
              ) : homeStatsStatus?.suggestions && homeStatsStatus.suggestions.length > 0 ? (
                <TeamSelector
                  teamName={game.homeTeam.name}
                  teamId={game.homeTeam.id}
                  suggestions={homeStatsStatus.suggestions}
                  onSelect={(name) => handleTeamSelect(true, name, game.homeTeam.id)}
                  disabled={loading}
                />
              ) : (
                <div className="text-sm font-bold text-red-500 text-center">Not found</div>
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
                  <span className={prediction._meta.stats.away ? 'text-green-600' : 'text-orange-500'}>
                    {game.awayTeam.name}: {prediction._meta.stats.away?.matched || 'No match'}
                  </span>
                  <span className={prediction._meta.stats.home ? 'text-green-600' : 'text-orange-500'}>
                    {game.homeTeam.name}: {prediction._meta.stats.home?.matched || 'No match'}
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
