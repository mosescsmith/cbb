/**
 * Team Alias Storage Service
 *
 * Persists user-corrected team name mappings in localStorage.
 * When a user selects a fuzzy match for a team, we store that mapping
 * so future lookups automatically resolve to the correct team.
 *
 * Format: { "ncaa_team_name_lowercase": "TeamRankings matched name" }
 */

const STORAGE_KEY = 'cbb-team-aliases';

export interface TeamAliasStore {
  [ncaaName: string]: string; // lowercase NCAA name -> TeamRankings name
}

/**
 * Load all team aliases from localStorage
 */
export function loadTeamAliases(): TeamAliasStore {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load team aliases from localStorage:', error);
    return {};
  }
}

/**
 * Save team aliases to localStorage
 */
function saveTeamAliases(store: TeamAliasStore): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save team aliases to localStorage:', error);
  }
}

/**
 * Store a team name alias (NCAA name -> TeamRankings name)
 */
export function storeTeamAlias(ncaaName: string, teamRankingsName: string): void {
  const store = loadTeamAliases();
  const key = ncaaName.toLowerCase().trim();
  store[key] = teamRankingsName;
  saveTeamAliases(store);
}

/**
 * Get the stored alias for an NCAA team name
 * Returns null if no alias exists
 */
export function getTeamAlias(ncaaName: string): string | null {
  const store = loadTeamAliases();
  const key = ncaaName.toLowerCase().trim();
  return store[key] || null;
}

/**
 * Check if a team has a stored alias
 */
export function hasTeamAlias(ncaaName: string): boolean {
  return getTeamAlias(ncaaName) !== null;
}

/**
 * Remove a team alias
 */
export function removeTeamAlias(ncaaName: string): void {
  const store = loadTeamAliases();
  const key = ncaaName.toLowerCase().trim();
  delete store[key];
  saveTeamAliases(store);
}

/**
 * Clear all team aliases
 */
export function clearAllTeamAliases(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get count of stored aliases
 */
export function getAliasCount(): number {
  const store = loadTeamAliases();
  return Object.keys(store).length;
}

/**
 * Get all aliases as an array for display
 */
export function getAllAliasesArray(): Array<{ ncaaName: string; mappedTo: string }> {
  const store = loadTeamAliases();
  return Object.entries(store).map(([ncaaName, mappedTo]) => ({
    ncaaName,
    mappedTo,
  }));
}
