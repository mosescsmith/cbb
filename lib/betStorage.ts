// Bet storage with status tracking for dashboard analytics

const BETS_STORAGE_KEY = 'cbb-bets';

export type BetStatus = 'active' | 'won' | 'lost' | 'push' | 'void';
export type BetType = 'spread' | 'over' | 'under';
export type BetHalf = '1st' | '2nd' | 'full';

export interface StoredBet {
  id: string;
  // Bet details
  date: string; // MM/DD/YY format from bet slip
  time: string;
  betType: BetType;
  line: number;
  team?: string; // For spread bets
  awayTeam: string;
  homeTeam: string;
  half: BetHalf;
  // Financials
  toWin: number;
  wager?: number; // Amount wagered (if tracked)
  odds?: number;
  // Matching
  gameId?: string;
  // Status tracking
  status: BetStatus;
  actualScore?: { away: number; home: number }; // Final score for settled bets
  settledAt?: string; // ISO timestamp when bet was settled
  createdAt: string; // ISO timestamp when bet was added
  // User edits
  isVerified?: boolean; // User confirmed the bet details are correct
  notes?: string;
}

// Legacy format for migration
interface LegacyBet {
  id: string;
  date?: string;
  time?: string;
  toWin: number;
  betType: BetType;
  line: number;
  team?: string;
  awayTeam: string;
  homeTeam: string;
  half: BetHalf;
  odds?: number;
  gameId?: string;
}

/**
 * Migrate legacy bet format to new format
 */
function migrateBet(bet: LegacyBet | StoredBet): StoredBet {
  // Already new format
  if ('status' in bet && 'createdAt' in bet) {
    return bet as StoredBet;
  }

  // Migrate from legacy
  return {
    ...bet,
    date: bet.date || '',
    time: bet.time || '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Parse bet date string (MM/DD/YY) to Date object
 */
export function parseBetDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;

  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  if (year < 100) {
    year += year > 50 ? 1900 : 2000;
  }

  return new Date(year, month, day);
}

/**
 * Get today's date at midnight for comparison
 */
function getTodayMidnight(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Check if a bet is from today
 */
export function isBetFromToday(bet: StoredBet): boolean {
  const betDate = parseBetDate(bet.date);
  if (!betDate) return true; // Assume unparseable dates are current

  const today = getTodayMidnight();
  betDate.setHours(0, 0, 0, 0);

  return betDate.getTime() === today.getTime();
}

/**
 * Check if a bet is from the past (before today)
 */
export function isBetFromPast(bet: StoredBet): boolean {
  const betDate = parseBetDate(bet.date);
  if (!betDate) return false;

  const today = getTodayMidnight();
  betDate.setHours(0, 0, 0, 0);

  return betDate < today;
}

/**
 * Load all bets from localStorage (with migration)
 */
export function loadBets(): StoredBet[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(BETS_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as (LegacyBet | StoredBet)[];
    return parsed.map(migrateBet);
  } catch {
    return [];
  }
}

/**
 * Save bets to localStorage
 */
export function saveBets(bets: StoredBet[]): void {
  if (typeof window === 'undefined') return;

  if (bets.length === 0) {
    localStorage.removeItem(BETS_STORAGE_KEY);
  } else {
    localStorage.setItem(BETS_STORAGE_KEY, JSON.stringify(bets));
  }
}

/**
 * Load active bets only (today's bets that haven't been settled)
 */
export function loadActiveBets(): StoredBet[] {
  const allBets = loadBets();
  return allBets.filter(bet => bet.status === 'active');
}

/**
 * Load today's active bets (for main page display)
 */
export function loadTodaysActiveBets(): StoredBet[] {
  const allBets = loadBets();
  return allBets.filter(bet => bet.status === 'active' && isBetFromToday(bet));
}

/**
 * Load settled bets (won/lost/push/void)
 */
export function loadSettledBets(): StoredBet[] {
  const allBets = loadBets();
  return allBets.filter(bet => bet.status !== 'active');
}

/**
 * Auto-settle old active bets (mark past-day active bets for review)
 * Returns bets that need user attention
 */
export function getUnsettledPastBets(): StoredBet[] {
  const allBets = loadBets();
  return allBets.filter(bet => bet.status === 'active' && isBetFromPast(bet));
}

/**
 * Add new bets to storage
 */
export function addBets(newBets: Omit<StoredBet, 'status' | 'createdAt'>[]): StoredBet[] {
  const existing = loadBets();
  const withDefaults: StoredBet[] = newBets.map(bet => ({
    ...bet,
    status: 'active' as BetStatus,
    createdAt: new Date().toISOString(),
  }));
  const combined = [...existing, ...withDefaults];
  saveBets(combined);
  return combined;
}

/**
 * Update a bet by ID
 */
export function updateBet(betId: string, updates: Partial<StoredBet>): StoredBet | null {
  const bets = loadBets();
  const index = bets.findIndex(b => b.id === betId);

  if (index === -1) return null;

  bets[index] = { ...bets[index], ...updates };
  saveBets(bets);
  return bets[index];
}

/**
 * Settle a bet with result
 */
export function settleBet(
  betId: string,
  result: 'won' | 'lost' | 'push' | 'void',
  actualScore?: { away: number; home: number }
): StoredBet | null {
  return updateBet(betId, {
    status: result,
    actualScore,
    settledAt: new Date().toISOString(),
  });
}

/**
 * Remove a specific bet by ID
 */
export function removeBet(betId: string): StoredBet[] {
  const bets = loadBets();
  const filtered = bets.filter(b => b.id !== betId);
  saveBets(filtered);
  return filtered;
}

/**
 * Clear all bets
 */
export function clearAllBets(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(BETS_STORAGE_KEY);
}

// ============ Analytics Functions ============

export interface BetStats {
  total: number;
  won: number;
  lost: number;
  push: number;
  pending: number;
  winRate: number; // As percentage (0-100)
  roi: number; // Return on investment percentage
  totalWagered: number;
  totalWon: number;
  netProfit: number;
}

export interface BetStatsByCategory {
  overall: BetStats;
  byType: {
    spread: BetStats;
    over: BetStats;
    under: BetStats;
  };
  byHalf: {
    '1st': BetStats;
    '2nd': BetStats;
    full: BetStats;
  };
}

function calculateStats(bets: StoredBet[]): BetStats {
  const settled = bets.filter(b => b.status !== 'active');
  const won = bets.filter(b => b.status === 'won');
  const lost = bets.filter(b => b.status === 'lost');
  const push = bets.filter(b => b.status === 'push');
  const pending = bets.filter(b => b.status === 'active');

  const decisioned = won.length + lost.length;
  const winRate = decisioned > 0 ? (won.length / decisioned) * 100 : 0;

  // Calculate financials (estimate wager as toWin / typical -110 odds = ~0.91)
  const totalWon = won.reduce((sum, b) => sum + b.toWin, 0);
  const totalWagered = settled.reduce((sum, b) => sum + (b.wager || b.toWin * 1.1), 0);
  const totalLost = lost.reduce((sum, b) => sum + (b.wager || b.toWin * 1.1), 0);
  const netProfit = totalWon - totalLost;
  const roi = totalWagered > 0 ? (netProfit / totalWagered) * 100 : 0;

  return {
    total: bets.length,
    won: won.length,
    lost: lost.length,
    push: push.length,
    pending: pending.length,
    winRate: Math.round(winRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    totalWagered: Math.round(totalWagered * 100) / 100,
    totalWon: Math.round(totalWon * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  };
}

/**
 * Get comprehensive bet statistics
 */
export function getBetStats(): BetStatsByCategory {
  const allBets = loadBets();

  return {
    overall: calculateStats(allBets),
    byType: {
      spread: calculateStats(allBets.filter(b => b.betType === 'spread')),
      over: calculateStats(allBets.filter(b => b.betType === 'over')),
      under: calculateStats(allBets.filter(b => b.betType === 'under')),
    },
    byHalf: {
      '1st': calculateStats(allBets.filter(b => b.half === '1st')),
      '2nd': calculateStats(allBets.filter(b => b.half === '2nd')),
      full: calculateStats(allBets.filter(b => b.half === 'full')),
    },
  };
}

/**
 * Get recent bet history (last N days)
 */
export function getRecentBets(days: number = 30): StoredBet[] {
  const allBets = loadBets();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return allBets.filter(bet => {
    const betDate = parseBetDate(bet.date);
    return betDate && betDate >= cutoff;
  }).sort((a, b) => {
    const dateA = parseBetDate(a.date);
    const dateB = parseBetDate(b.date);
    if (!dateA || !dateB) return 0;
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });
}
