'use client';

import { useState, useCallback } from 'react';

interface TeamSuggestion {
  name: string;
  score: number; // 0-100
}

interface TeamSelectorProps {
  teamName: string;
  teamId: string;
  suggestions: TeamSuggestion[];
  onSelect: (selectedTeamName: string) => void;
  disabled?: boolean;
}

export function TeamSelector({
  teamName,
  teamId,
  suggestions: initialSuggestions,
  onSelect,
  disabled = false,
}: TeamSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TeamSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Use search results if available, otherwise use initial suggestions
  const suggestions = searchResults.length > 0 ? searchResults : initialSuggestions;

  const handleSelect = (suggestion: TeamSuggestion) => {
    setSelectedTeam(suggestion.name);
    setIsOpen(false);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    onSelect(suggestion.name);
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/team-stats/${teamId}?teamName=${encodeURIComponent(searchQuery.trim())}`
      );
      const data = await response.json();

      if (data._meta?.matched) {
        // Exact match found - select it directly
        setSelectedTeam(data.teamName);
        setIsOpen(false);
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
        onSelect(data.teamName);
      } else if (data.suggestions && data.suggestions.length > 0) {
        // Fuzzy matches found
        setSearchResults(data.suggestions);
      } else {
        setSearchError('No teams found matching your search');
        setSearchResults([]);
      }
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, teamId, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  if (initialSuggestions.length === 0 && !showSearch) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-red-600">
          No similar teams found
        </div>
        <button
          onClick={() => setShowSearch(true)}
          disabled={disabled}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Search manually
        </button>
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
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {/* Search Input Section */}
          <div className="px-3 py-2 border-b bg-gray-50">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search team name..."
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus={showSearch}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className={`
                  px-3 py-1 text-sm rounded
                  ${isSearching || !searchQuery.trim()
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'}
                `}
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>
            {searchError && (
              <div className="mt-1 text-xs text-red-600">{searchError}</div>
            )}
            {searchResults.length > 0 && (
              <div className="mt-1 text-xs text-green-600">
                Found {searchResults.length} matches
              </div>
            )}
          </div>

          {/* Suggestions Header */}
          <div className="px-3 py-2 text-xs text-gray-500 border-b">
            {searchResults.length > 0 ? 'Search results:' : 'Suggested matches:'}
          </div>

          {/* Suggestions List */}
          {suggestions.map((suggestion, idx) => (
            <button
              key={`${suggestion.name}-${idx}`}
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
