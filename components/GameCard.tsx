import Link from 'next/link';
import { Game } from '@/lib/types';

export function GameCard({ game }: { game: Game }) {
  const gameDate = new Date(game.date);
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const statusBadge = () => {
    const period = game.currentPeriod?.toLowerCase() || '';

    if (game.status === 'final') {
      return <span className="text-xs text-gray-500">Final</span>;
    }

    if (period.includes('halftime') || game.status === 'halftime') {
      return <span className="text-xs text-orange-600 font-semibold">Halftime</span>;
    }

    if (period === '1st' || period.includes('1st')) {
      return <span className="text-xs text-green-600 font-semibold">1st Half</span>;
    }

    if (period === '2nd' || period.includes('2nd')) {
      return <span className="text-xs text-blue-600 font-semibold">2nd Half</span>;
    }

    if (game.status === 'in_progress') {
      return <span className="text-xs text-green-600 font-semibold">Live</span>;
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

      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        {statusBadge()}
        <span className="text-xs text-gray-400 uppercase">{game.location}</span>
      </div>
    </Link>
  );
}
