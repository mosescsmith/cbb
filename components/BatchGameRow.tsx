'use client';

import { useState, useCallback } from 'react';
import { Game, PredictionResponse } from '@/lib/types';
import { StoredPrediction } from '@/lib/predictionStorage';

interface TeamMatchStatus {
  matched: boolean;
  matchedName?: string;
  matchConfidence?: number;
  suggestions?: Array<{ name: string; score: number }>;
}

interface TeamSuggestion {
  name: string;
  score: number;
}

interface BatchGameRowProps {
  game: Game;
  isSelected: boolean;
  isNeutral: boolean;
  onSelectChange: (selected: boolean) => void;
  onNeutralChange: (neutral: boolean) => void;
  cachedPrediction: StoredPrediction | null;
  isProcessing: boolean;
  // Team matching props
  homeTeamStatus?: TeamMatchStatus | null;
  awayTeamStatus?: TeamMatchStatus | null;
  homeTeamOverride?: string | null;
  awayTeamOverride?: string | null;
  onHomeTeamCorrect?: (correctedName: string) => void;
  onAwayTeamCorrect?: (correctedName: string) => void;
}

export function BatchGameRow({
  game,
  isSelected,
  isNeutral,
  onSelectChange,
  onNeutralChange,
  cachedPrediction,
  isProcessing,
  homeTeamStatus,
  awayTeamStatus,
  homeTeamOverride,
  awayTeamOverride,
  onHomeTeamCorrect,
  onAwayTeamCorrect,
}: BatchGameRowProps) {
  const [showHomeDropdown, setShowHomeDropdown] = useState(false);
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);

  // Search state for home team
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [homeSearchResults, setHomeSearchResults] = useState<TeamSuggestion[]>([]);
  const [homeSearching, setHomeSearching] = useState(false);
  const [homeSearchError, setHomeSearchError] = useState<string | null>(null);

  // Search state for away team
  const [awaySearchQuery, setAwaySearchQuery] = useState('');
  const [awaySearchResults, setAwaySearchResults] = useState<TeamSuggestion[]>([]);
  const [awaySearching, setAwaySearching] = useState(false);
  const [awaySearchError, setAwaySearchError] = useState<string | null>(null);

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const prediction = cachedPrediction?.prediction;
  const hasPrediction = !!prediction;

  // Determine if teams have issues
  const homeHasIssue = homeTeamStatus && !homeTeamStatus.matched;
  const awayHasIssue = awayTeamStatus && !awayTeamStatus.matched;
  const hasTeamIssue = homeHasIssue || awayHasIssue;

  // Get display names (use override if set, otherwise original)
  const homeDisplayName = homeTeamOverride || game.homeTeam.shortName || game.homeTeam.name;
  const awayDisplayName = awayTeamOverride || game.awayTeam.shortName || game.awayTeam.name;

  // Search handler
  const handleSearch = useCallback(async (
    teamId: string,
    query: string,
    setSearching: (v: boolean) => void,
    setError: (v: string | null) => void,
    setResults: (v: TeamSuggestion[]) => void
  ) => {
    if (!query.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/team-stats/${teamId}?teamName=${encodeURIComponent(query.trim())}`
      );
      const data = await response.json();

      if (data._meta?.matched) {
        // Exact match found - show it as a result for user to select
        setResults([{ name: data.teamName, score: 100 }]);
      } else if (data.suggestions && data.suggestions.length > 0) {
        // Fuzzy matches found
        setResults(data.suggestions);
      } else {
        setError('No teams found');
        setResults([]);
      }
    } catch {
      setError('Search failed');
    } finally {
      setSearching(false);
    }
  }, []);

  const renderTeamWithStatus = (
    team: { name: string; shortName?: string; rank?: number; id: string },
    status: TeamMatchStatus | null | undefined,
    override: string | null | undefined,
    isHome: boolean,
    showDropdown: boolean,
    setShowDropdown: (show: boolean) => void,
    onCorrect?: (name: string) => void
  ) => {
    const hasIssue = status && !status.matched;
    const displayName = override || team.shortName || team.name;

    // Get search state based on isHome
    const searchQuery = isHome ? homeSearchQuery : awaySearchQuery;
    const setSearchQuery = isHome ? setHomeSearchQuery : setAwaySearchQuery;
    const searchResults = isHome ? homeSearchResults : awaySearchResults;
    const setSearchResults = isHome ? setHomeSearchResults : setAwaySearchResults;
    const searching = isHome ? homeSearching : awaySearching;
    const setSearching = isHome ? setHomeSearching : setAwaySearching;
    const searchError = isHome ? homeSearchError : awaySearchError;
    const setSearchError = isHome ? setHomeSearchError : setAwaySearchError;

    // Use search results if available, otherwise use initial suggestions
    const suggestions = searchResults.length > 0 ? searchResults : (status?.suggestions || []);

    return (
      <div className="relative inline-block">
        <span
          className={`font-medium truncate ${
            hasIssue ? 'text-orange-400' : override ? 'text-green-400' : 'text-white'
          }`}
        >
          {team.rank && (
            <span className="text-yellow-400 text-sm mr-1">#{team.rank}</span>
          )}
          {displayName}
          {/* Warning icon for unmatched teams */}
          {hasIssue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(!showDropdown);
                if (!showDropdown) {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchError(null);
                }
              }}
              className="ml-1 text-orange-400 hover:text-orange-300"
              title="Team not found - click to correct"
            >
              ⚠️
            </button>
          )}
          {/* Edit button for all teams (matched or not) */}
          {!hasIssue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(!showDropdown);
                if (!showDropdown) {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchError(null);
                }
              }}
              className="ml-1 text-gray-500 hover:text-blue-400 text-xs"
              title="Edit team name"
            >
              ✏️
            </button>
          )}
          {override && (
            <span className="ml-1 text-xs text-green-500" title={`Corrected from: ${team.name}`}>
              ✓
            </span>
          )}
        </span>

        {/* Correction Dropdown with Search */}
        {showDropdown && (
          <>
            {/* Click outside to close */}
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(false);
              }}
            />
            <div className="absolute z-50 mt-1 left-0 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl">
              <div className="p-2 border-b border-gray-700">
                <div className="text-xs text-gray-400">Select correct team for:</div>
                <div className="text-sm text-orange-400 font-medium truncate">{team.name}</div>
              </div>

              {/* Search Input */}
              <div className="p-2 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearch(
                          team.id,
                          searchQuery,
                          setSearching,
                          setSearchError,
                          setSearchResults
                        );
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Search team name..."
                    className="flex-1 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSearch(
                        team.id,
                        searchQuery,
                        setSearching,
                        setSearchError,
                        setSearchResults
                      );
                    }}
                    disabled={searching || !searchQuery.trim()}
                    className={`px-3 py-1.5 text-sm rounded ${
                      searching || !searchQuery.trim()
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}
                  >
                    {searching ? '...' : 'Search'}
                  </button>
                </div>
                {searchError && (
                  <div className="mt-1 text-xs text-red-400">{searchError}</div>
                )}
                {searchResults.length > 0 && (
                  <div className="mt-1 text-xs text-green-400">
                    Found {searchResults.length} matches
                  </div>
                )}
              </div>

              {/* Suggestions Header */}
              <div className="px-2 py-1 text-xs text-gray-500 border-b border-gray-700">
                {searchResults.length > 0 ? 'Search results:' : 'Suggested matches:'}
              </div>

              {/* Suggestions List */}
              <div className="max-h-48 overflow-y-auto">
                {suggestions.length > 0 ? (
                  suggestions.map((suggestion) => (
                    <button
                      key={suggestion.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCorrect?.(suggestion.name);
                        setShowDropdown(false);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex justify-between items-center border-b border-gray-700/50 last:border-b-0"
                    >
                      <span className="text-white truncate">{suggestion.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ml-2 shrink-0 ${
                        suggestion.score >= 80 ? 'bg-green-900/50 text-green-400' :
                        suggestion.score >= 60 ? 'bg-yellow-900/50 text-yellow-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>
                        {suggestion.score}%
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No suggestions available.<br/>
                    Use search above to find the team.
                  </div>
                )}
              </div>

              <div className="p-2 border-t border-gray-700">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropdown(false);
                  }}
                  className="w-full text-xs text-gray-400 hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        isProcessing
          ? 'border-yellow-500 bg-yellow-500/10'
          : hasPrediction
          ? 'border-green-500/50 bg-green-500/5'
          : hasTeamIssue
          ? 'border-orange-500/50 bg-orange-500/5'
          : isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onSelectChange(e.target.checked)}
        disabled={isProcessing}
        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
      />

      {/* Game Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Away Team */}
          {renderTeamWithStatus(
            game.awayTeam,
            awayTeamStatus,
            awayTeamOverride,
            false,
            showAwayDropdown,
            setShowAwayDropdown,
            onAwayTeamCorrect
          )}
          <span className="text-gray-500">@</span>
          {/* Home Team */}
          {renderTeamWithStatus(
            game.homeTeam,
            homeTeamStatus,
            homeTeamOverride,
            true,
            showHomeDropdown,
            setShowHomeDropdown,
            onHomeTeamCorrect
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {formatTime(game.date)}
          {game.status !== 'scheduled' && (
            <span className="ml-2 text-orange-400">{game.status.toUpperCase()}</span>
          )}
          {hasTeamIssue && (
            <span className="ml-2 text-orange-400">
              (Missing: {[awayHasIssue && 'Away', homeHasIssue && 'Home'].filter(Boolean).join(', ')})
            </span>
          )}
        </div>
      </div>

      {/* Neutral Toggle */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Neutral</label>
        <button
          onClick={() => onNeutralChange(!isNeutral)}
          disabled={isProcessing}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            isNeutral ? 'bg-purple-500' : 'bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              isNeutral ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Prediction Status / Result */}
      <div className="w-32 text-right">
        {isProcessing ? (
          <div className="flex items-center justify-end gap-2">
            <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-yellow-400">Processing...</span>
          </div>
        ) : hasPrediction ? (
          <div className="text-right">
            <div className="text-sm font-mono">
              <span className="text-white">{prediction.awayScore}</span>
              <span className="text-gray-500 mx-1">-</span>
              <span className="text-white">{prediction.homeScore}</span>
            </div>
            <div className="text-xs text-gray-400">
              {prediction.confidence && `${Math.round(prediction.confidence * 100)}% conf`}
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-500">Not predicted</span>
        )}
      </div>
    </div>
  );
}
