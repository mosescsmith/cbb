// Bet types and parsing logic

export interface ParsedBet {
  id: string;
  date: string;
  time: string;
  toWin: number;
  betType: 'spread' | 'over' | 'under';
  line: number;
  team?: string; // For spread bets
  awayTeam: string;
  homeTeam: string;
  half: '1st' | '2nd' | 'full'; // Which half the bet is for
}

export interface BetWithStatus extends ParsedBet {
  gameId?: string; // Matched game ID
  currentAwayScore?: number;
  currentHomeScore?: number;
  isCovering?: boolean;
  coveringBy?: number; // How much covering/losing by
}

/**
 * Parse the bet slip text format into structured bets
 * Format example:
 * 11/25/25
 * 5:37 PM
 * Placed - Single
 * To Win $ 1.82
 * Under 70 (-110)
 * (6555) Chicago State @ (6556) IPFW
 */
export function parseBetSlip(text: string): ParsedBet[] {
  const bets: ParsedBet[] = [];
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);

  let i = 0;
  while (i < lines.length) {
    // Look for date pattern (MM/DD/YY)
    const dateMatch = lines[i]?.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
    if (!dateMatch) {
      i++;
      continue;
    }

    const date = dateMatch[1];
    i++;

    // Time (e.g., "5:37 PM")
    const time = lines[i] || '';
    i++;

    // Skip "Placed - Single"
    if (lines[i]?.includes('Placed')) i++;

    // "To Win $ X.XX"
    const toWinMatch = lines[i]?.match(/To Win \$ ([\d.]+)/);
    const toWin = toWinMatch ? parseFloat(toWinMatch[1]) : 0;
    i++;

    // Bet line (e.g., "Under 70 (-110)" or "Bellarmine +1.5 (-115)")
    const betLine = lines[i] || '';
    i++;

    // Matchup "(XXXX) Team A @ (XXXX) Team B"
    const matchupLine = lines[i] || '';
    const matchupMatch = matchupLine.match(/\(\d+\)\s*(.+?)\s*@\s*\(\d+\)\s*(.+)/);
    i++;

    if (!matchupMatch) continue;

    const awayTeam = matchupMatch[1].trim();
    const homeTeam = matchupMatch[2].trim();

    // Parse the bet line
    const bet = parseBetLine(betLine, awayTeam, homeTeam);
    if (!bet) continue;

    bets.push({
      id: `${date}-${time}-${awayTeam}-${homeTeam}`.replace(/\s/g, '-'),
      date,
      time,
      toWin,
      ...bet,
      awayTeam,
      homeTeam,
      half: '1st', // Default to 1st half - can be changed manually
    });
  }

  return bets;
}

function parseBetLine(line: string, awayTeam: string, homeTeam: string): {
  betType: 'spread' | 'over' | 'under';
  line: number;
  team?: string;
} | null {
  // Over/Under pattern: "Over 70 (-110)" or "Under 68.5 (-110)"
  const ouMatch = line.match(/^(Over|Under)\s+([\d.]+)/i);
  if (ouMatch) {
    return {
      betType: ouMatch[1].toLowerCase() as 'over' | 'under',
      line: parseFloat(ouMatch[2]),
    };
  }

  // Spread pattern: "Bellarmine +1.5 (-115)" or "Bradley -3.5 (-105)"
  const spreadMatch = line.match(/^(.+?)\s+([+-][\d.]+)/);
  if (spreadMatch) {
    return {
      betType: 'spread',
      team: spreadMatch[1].trim(),
      line: parseFloat(spreadMatch[2]),
    };
  }

  return null;
}

/**
 * Calculate if a bet is covering based on current scores
 */
export function calculateBetStatus(
  bet: ParsedBet,
  awayScore: number,
  homeScore: number,
  isFirstHalf: boolean
): { isCovering: boolean; coveringBy: number } {
  const totalScore = awayScore + homeScore;

  if (bet.betType === 'over') {
    const coveringBy = totalScore - bet.line;
    return { isCovering: coveringBy > 0, coveringBy };
  }

  if (bet.betType === 'under') {
    const coveringBy = bet.line - totalScore;
    return { isCovering: coveringBy > 0, coveringBy };
  }

  // Spread bet
  if (bet.betType === 'spread' && bet.team) {
    // Determine if bet team is home or away
    const isHomeBet = bet.team.toLowerCase().includes(bet.homeTeam.toLowerCase()) ||
                      bet.homeTeam.toLowerCase().includes(bet.team.toLowerCase());

    const betTeamScore = isHomeBet ? homeScore : awayScore;
    const opponentScore = isHomeBet ? awayScore : homeScore;

    // Spread is from perspective of bet team
    // If bet is Team -3.5, they need to win by more than 3.5
    // If bet is Team +3.5, they need to lose by less than 3.5 (or win)
    const actualMargin = betTeamScore - opponentScore;
    const coveringBy = actualMargin + bet.line; // line is negative for favorites

    return { isCovering: coveringBy > 0, coveringBy };
  }

  return { isCovering: false, coveringBy: 0 };
}

/**
 * Try to match a bet to a game by team names
 */
export function matchBetToGame(bet: ParsedBet, games: Array<{ id: string; homeTeam: { name: string }; awayTeam: { name: string } }>): string | undefined {
  const normalizeTeam = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

  const betAway = normalizeTeam(bet.awayTeam);
  const betHome = normalizeTeam(bet.homeTeam);

  for (const game of games) {
    const gameAway = normalizeTeam(game.awayTeam.name);
    const gameHome = normalizeTeam(game.homeTeam.name);

    // Check for partial matches (team names may differ slightly)
    const awayMatch = gameAway.includes(betAway) || betAway.includes(gameAway) ||
                      gameAway.split(' ').some(w => betAway.includes(w) && w.length > 3);
    const homeMatch = gameHome.includes(betHome) || betHome.includes(gameHome) ||
                      gameHome.split(' ').some(w => betHome.includes(w) && w.length > 3);

    if (awayMatch || homeMatch) {
      return game.id;
    }
  }

  return undefined;
}
