'use client';

import { useState } from 'react';

interface TeamSuggestion {
  teamId: string;
  teamName: string;
  similarity: number;
  gamesCount: number;
}

interface TeamStatsMissingProps {
  teamName: string;
  teamId: string;
  suggestions?: TeamSuggestion[];
  onSelectTeam: (teamId: string, teamName: string) => void;
  isLoading?: boolean;
  saveAlias?: boolean; // Whether to save the alias when selecting
}

export function TeamStatsMissing({
  teamName,
  teamId,
  suggestions,
  onSelectTeam,
  isLoading,
  saveAlias = true,
}: TeamStatsMissingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [savingAlias, setSavingAlias] = useState(false);

  const handleSelectTeam = async (suggestion: TeamSuggestion) => {
    if (saveAlias) {
      setSavingAlias(true);
      try {
        // Save the alias for future use
        await fetch('/api/team-alias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: teamId,
            to: suggestion.teamId,
          }),
        });
        console.log(`Saved alias: ${teamId} → ${suggestion.teamId}`);
      } catch (error) {
        console.error('Failed to save alias:', error);
        // Continue anyway - the alias just won't be saved
      } finally {
        setSavingAlias(false);
      }
    }

    onSelectTeam(suggestion.teamId, suggestion.teamName);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <span className="text-amber-500 text-lg">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">
            Stats not found for {teamName}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            Team ID: {teamId}
          </p>

          {suggestions && suggestions.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1"
              >
                <span>{isOpen ? '▼' : '▶'}</span>
                {isOpen ? 'Hide' : 'Show'} similar teams ({suggestions.length})
              </button>

              {isOpen && (
                <div className="mt-2 space-y-1.5">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.teamId}
                      onClick={() => handleSelectTeam(suggestion)}
                      disabled={isLoading || savingAlias}
                      className="w-full text-left p-2 rounded border border-amber-200 hover:border-amber-400 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {suggestion.teamName}
                        </span>
                        <span className="text-xs text-amber-600">
                          {Math.round(suggestion.similarity * 100)}% match
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          ID: {suggestion.teamId}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          {suggestion.gamesCount} games
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(!suggestions || suggestions.length === 0) && (
            <p className="text-xs text-amber-600 mt-2 italic">
              No similar teams found. Stats will be fetched when you get a prediction.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
