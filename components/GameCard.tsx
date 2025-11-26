import Link from 'next/link';
import { Game, PredictionResponse } from '@/lib/types';

interface Bet {
  id: string;
  betType: 'spread' | 'over' | 'under';
  line: number;
  team?: string;
  half: '1st' | '2nd' | 'full';
  toWin: number;
}

interface CachedPrediction {
  prediction: PredictionResponse;
  timestamp: number;
}

interface GameCardProps {
  game: Game;
  bets?: Bet[];
  cachedPrediction?: CachedPrediction | null;
}

export function GameCard({ game, bets = [], cachedPrediction }: GameCardProps) {
  const gameDate = new Date(game.date);
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const statusBadge = () => {
    const period = game.currentPeriod?.toLowerCase() || '';
    const clock = game.contestClock; // e.g., "13:15"

    if (game.status === 'final') {
      return <span className="text-xs text-gray-500">Final</span>;
    }

    if (period.includes('halftime') || game.status === 'halftime') {
      return <span className="text-xs text-orange-600 font-semibold">Halftime</span>;
    }

    if (period === '1st' || period.includes('1st')) {
      return (
        <span className="text-xs text-green-600 font-semibold">
          1st Half {clock && <span className="font-mono ml-1">{clock}</span>}
        </span>
      );
    }

    if (period === '2nd' || period.includes('2nd')) {
      return (
        <span className="text-xs text-blue-600 font-semibold">
          2nd Half {clock && <span className="font-mono ml-1">{clock}</span>}
        </span>
      );
    }

    if (game.status === 'in_progress') {
      return (
        <span className="text-xs text-green-600 font-semibold">
          Live {clock && <span className="font-mono ml-1">{clock}</span>}
        </span>
      );
    }

    return <span className="text-xs text-gray-400">{timeStr}</span>;
  };

  return (
    <Link
      href={`/game/${game.id}`}
      className="block border rounded-lg p-4 hover:bg-gray-50 hover:border-blue-400 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1">
          {/* Away Team */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {game.awayTeam.rank && (
                <span className="text-xs font-bold text-gray-500">
                  #{game.awayTeam.rank}
                </span>
              )}
              <span className="font-medium">{game.awayTeam.name}</span>
            </div>
            {game.awayScore !== undefined && (
              <span className="text-xl font-bold">{game.awayScore}</span>
            )}
          </div>

          {/* Home Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {game.homeTeam.rank && (
                <span className="text-xs font-bold text-gray-500">
                  #{game.homeTeam.rank}
                </span>
              )}
              <span className="font-medium">{game.homeTeam.name}</span>
            </div>
            {game.homeScore !== undefined && (
              <span className="text-xl font-bold">{game.homeScore}</span>
            )}
          </div>
        </div>
      </div>

      {/* Bet Tracking Section */}
      {bets.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
          <div className="space-y-2">
            {bets.map((bet) => {
              // Calculate bet status based on current scores
              const awayScore = game.awayScore ?? 0;
              const homeScore = game.homeScore ?? 0;
              const totalScore = awayScore + homeScore;

              let isCovering = false;
              let coveringBy = 0;
              let betDisplay = '';

              if (bet.betType === 'over') {
                coveringBy = totalScore - bet.line;
                isCovering = coveringBy > 0;
                betDisplay = `Over ${bet.line}`;
              } else if (bet.betType === 'under') {
                coveringBy = bet.line - totalScore;
                isCovering = coveringBy > 0;
                betDisplay = `Under ${bet.line}`;
              } else if (bet.betType === 'spread' && bet.team) {
                // Determine if bet team is home or away
                const isHomeBet = bet.team.toLowerCase().includes(game.homeTeam.name.toLowerCase().split(' ')[0]) ||
                                  game.homeTeam.name.toLowerCase().includes(bet.team.toLowerCase().split(' ')[0]);
                const betTeamScore = isHomeBet ? homeScore : awayScore;
                const opponentScore = isHomeBet ? awayScore : homeScore;
                const actualMargin = betTeamScore - opponentScore;
                coveringBy = actualMargin + bet.line;
                isCovering = coveringBy > 0;
                betDisplay = `${bet.team} ${bet.line > 0 ? '+' : ''}${bet.line}`;
              }

              const hasScores = game.awayScore !== undefined && game.homeScore !== undefined;

              return (
                <div
                  key={bet.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    hasScores
                      ? isCovering
                        ? 'bg-green-100 border border-green-300'
                        : 'bg-red-100 border border-red-300'
                      : 'bg-gray-100 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${
                      hasScores
                        ? isCovering ? 'text-green-700' : 'text-red-700'
                        : 'text-gray-700'
                    }`}>
                      {betDisplay}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({bet.half === 'full' ? 'Game' : bet.half})
                    </span>
                  </div>
                  {hasScores && (
                    <span className={`font-bold ${isCovering ? 'text-green-700' : 'text-red-700'}`}>
                      {isCovering ? '+' : ''}{coveringBy.toFixed(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cached 1st Half Prediction */}
      {cachedPrediction && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded font-medium">
                1H Predicted
              </span>
              <span className="text-sm font-mono font-semibold text-gray-700">
                {cachedPrediction.prediction.awayScore} - {cachedPrediction.prediction.homeScore}
              </span>
            </div>
            {cachedPrediction.prediction.confidence && (
              <span className="text-xs text-gray-400">
                {Math.round(cachedPrediction.prediction.confidence * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        {statusBadge()}
        <span className="text-xs text-gray-400 uppercase">{game.location}</span>
      </div>
    </Link>
  );
}
