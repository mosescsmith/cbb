/**
 * Team matching utilities with fuzzy search support
 */

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching team names
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * Calculate similarity score (0-1) between two team names
 * 1 = exact match, 0 = completely different
 */
export function calculateSimilarity(name1: string, name2: string): number {
  const distance = levenshteinDistance(name1, name2);
  const maxLength = Math.max(name1.length, name2.length);
  return 1 - distance / maxLength;
}

/**
 * Normalize team name for comparison
 * Removes common variations and standardizes format
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\buniversity\b/g, '')
    .replace(/\bcollege\b/g, '')
    .replace(/\bstate\b/g, 'st')
    .replace(/\buniv\b/g, '')
    .replace(/\bu\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Check if two team names are likely the same team
 * Uses stricter matching to avoid false positives like Arizona matching Oregon
 */
export function isLikelyMatch(name1: string, name2: string, threshold: number = 0.85): boolean {
  // Exact match
  if (name1.toLowerCase() === name2.toLowerCase()) return true;

  // Normalized match (strips common words)
  const norm1 = normalizeTeamName(name1);
  const norm2 = normalizeTeamName(name2);
  if (norm1 === norm2) return true;

  // Check similarity on NORMALIZED names (core team names, not full "University of X" names)
  // This prevents "University of Arizona" from matching "University of Oregon"
  const normSimilarity = calculateSimilarity(norm1, norm2);
  if (normSimilarity >= threshold) return true;

  // Also require the normalized names to share significant content
  // At least one must contain the other, or they must have a common word
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  return false;
}

export interface TeamMatch {
  teamId: string;
  teamName: string;
  similarity: number;
  gamesCount: number;
}

/**
 * Find best matching teams from available cache files
 */
export function findSimilarTeams(
  searchName: string,
  availableTeams: Array<{ teamId: string; teamName: string; gamesCount: number }>,
  limit: number = 5
): TeamMatch[] {
  const matches = availableTeams
    .map(team => ({
      ...team,
      similarity: calculateSimilarity(searchName, team.teamName),
    }))
    .filter(team => team.similarity > 0.4) // Filter out very dissimilar teams
    .sort((a, b) => {
      // Sort by similarity first, then by games count
      if (Math.abs(a.similarity - b.similarity) < 0.05) {
        return b.gamesCount - a.gamesCount;
      }
      return b.similarity - a.similarity;
    })
    .slice(0, limit);

  return matches;
}
