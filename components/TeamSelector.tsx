'use client';

import { useState } from 'react';

interface TeamSuggestion {
  name: string;
  score: number; // 0-100
}

interface TeamSelectorProps {
  teamName: string;
  suggestions: TeamSuggestion[];
  onSelect: (selectedTeamName: string) => void;
  disabled?: boolean;
}

export function TeamSelector({
  teamName,
  suggestions,
  onSelect,
  disabled = false,
}: TeamSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const handleSelect = (suggestion: TeamSuggestion) => {
    setSelectedTeam(suggestion.name);
    setIsOpen(false);
    onSelect(suggestion.name);
  };

  if (suggestions.length === 0) {
    return (
      <div className="text-xs text-red-600">
        No similar teams found
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-3 py-2 text-left text-sm rounded-lg border
          ${selectedTeam
            ? 'bg-green-50 border-green-300 text-green-800'
            : 'bg-yellow-50 border-yellow-300 text-yellow-800'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-100 cursor-pointer'}
          transition-colors
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {selectedTeam ? (
              <span className="flex items-center gap-1">
                <span className="text-green-600">✓</span>
                <span className="truncate">{selectedTeam}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span>⚠️</span>
                <span className="truncate">&quot;{teamName}&quot; not found</span>
              </span>
            )}
          </div>
          <span className={`ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50">
            Select matching team:
          </div>
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(suggestion)}
              className={`
                w-full px-3 py-2 text-left text-sm hover:bg-blue-50
                ${idx !== suggestions.length - 1 ? 'border-b border-gray-100' : ''}
                ${selectedTeam === suggestion.name ? 'bg-blue-50' : ''}
              `}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{suggestion.name}</span>
                <span className={`
                  text-xs px-2 py-0.5 rounded-full ml-2 shrink-0
                  ${suggestion.score >= 80 ? 'bg-green-100 text-green-700' :
                    suggestion.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'}
                `}>
                  {suggestion.score}%
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
