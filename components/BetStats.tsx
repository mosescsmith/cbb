'use client';

import { BetStats, BetStatsByCategory } from '@/lib/betStorage';

interface BetStatsDisplayProps {
  stats: BetStatsByCategory;
}

function StatCard({ title, stats, highlight = false }: { title: string; stats: BetStats; highlight?: boolean }) {
  const hasData = stats.total > 0;
  const hasSettled = stats.won + stats.lost > 0;

  return (
    <div className={`rounded-xl p-4 ${highlight ? 'bg-blue-50 border-2 border-blue-200' : 'bg-white border border-gray-200'}`}>
      <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>

      {!hasData ? (
        <div className="text-gray-400 text-sm">No bets yet</div>
      ) : (
        <>
          {/* Win Rate */}
          <div className="mb-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-gray-800">
                {hasSettled ? `${stats.winRate}%` : '-'}
              </span>
              <span className="text-xs text-gray-500">win rate</span>
            </div>
            {hasSettled && (
              <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${stats.winRate}%` }}
                />
              </div>
            )}
          </div>

          {/* Record */}
          <div className="grid grid-cols-4 gap-2 text-center mb-3">
            <div>
              <div className="text-lg font-bold text-green-600">{stats.won}</div>
              <div className="text-xs text-gray-500">Won</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">{stats.lost}</div>
              <div className="text-xs text-gray-500">Lost</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-600">{stats.push}</div>
              <div className="text-xs text-gray-500">Push</div>
            </div>
            <div>
              <div className="text-lg font-bold text-blue-600">{stats.pending}</div>
              <div className="text-xs text-gray-500">Active</div>
            </div>
          </div>

          {/* Financials */}
          {hasSettled && (
            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Net Profit</span>
                <span className={`font-bold ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.netProfit >= 0 ? '+' : ''}${stats.netProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">ROI</span>
                <span className={`text-sm font-medium ${stats.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.roi >= 0 ? '+' : ''}{stats.roi}%
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BetStatsDisplay({ stats }: BetStatsDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">Overall Performance</h2>
        <StatCard title="All Bets" stats={stats.overall} highlight />
      </div>

      {/* By Bet Type */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">By Bet Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Spreads" stats={stats.byType.spread} />
          <StatCard title="Overs" stats={stats.byType.over} />
          <StatCard title="Unders" stats={stats.byType.under} />
        </div>
      </div>

      {/* By Half */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">By Game Period</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="1st Half" stats={stats.byHalf['1st']} />
          <StatCard title="2nd Half" stats={stats.byHalf['2nd']} />
          <StatCard title="Full Game" stats={stats.byHalf.full} />
        </div>
      </div>
    </div>
  );
}

// Quick summary component for header/sidebar use
export function BetStatsSummary({ stats }: { stats: BetStats }) {
  const hasSettled = stats.won + stats.lost > 0;

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1">
        <span className="text-green-600 font-bold">{stats.won}W</span>
        <span className="text-gray-400">-</span>
        <span className="text-red-600 font-bold">{stats.lost}L</span>
        {stats.push > 0 && (
          <>
            <span className="text-gray-400">-</span>
            <span className="text-gray-600 font-bold">{stats.push}P</span>
          </>
        )}
      </div>
      {hasSettled && (
        <>
          <span className="text-gray-300">|</span>
          <span className={stats.winRate >= 50 ? 'text-green-600' : 'text-red-600'}>
            {stats.winRate}%
          </span>
          <span className="text-gray-300">|</span>
          <span className={stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
            {stats.netProfit >= 0 ? '+' : ''}${stats.netProfit.toFixed(2)}
          </span>
        </>
      )}
      {stats.pending > 0 && (
        <>
          <span className="text-gray-300">|</span>
          <span className="text-blue-600">{stats.pending} pending</span>
        </>
      )}
    </div>
  );
}
