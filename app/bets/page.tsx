'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BetCard } from '@/components/BetCard';
import { BetStatsDisplay, BetStatsSummary } from '@/components/BetStats';
import {
  StoredBet,
  loadBets,
  getBetStats,
  getUnsettledPastBets,
  BetStatsByCategory,
  parseBetDate,
} from '@/lib/betStorage';

type Tab = 'active' | 'unsettled' | 'history' | 'stats';
type HistoryFilter = 'all' | 'won' | 'lost' | 'push';

export default function BetsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [bets, setBets] = useState<StoredBet[]>([]);
  const [stats, setStats] = useState<BetStatsByCategory | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [dateFilter, setDateFilter] = useState<'7d' | '30d' | 'all'>('30d');

  const loadData = () => {
    const allBets = loadBets();
    setBets(allBets);
    setStats(getBetStats());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Categorize bets
  const activeBets = bets.filter(b => b.status === 'active');
  const unsettledPastBets = getUnsettledPastBets();
  const settledBets = bets.filter(b => b.status !== 'active');

  // Apply filters to history
  const filteredHistory = settledBets
    .filter(bet => {
      if (historyFilter !== 'all' && bet.status !== historyFilter) return false;

      if (dateFilter !== 'all') {
        const betDate = parseBetDate(bet.date);
        if (!betDate) return false;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (dateFilter === '7d' ? 7 : 30));
        cutoff.setHours(0, 0, 0, 0);

        if (betDate < cutoff) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateA = parseBetDate(a.date);
      const dateB = parseBetDate(b.date);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });

  const tabs: { id: Tab; label: string; count?: number; alert?: boolean }[] = [
    { id: 'active', label: 'Active', count: activeBets.length },
    { id: 'unsettled', label: 'Needs Attention', count: unsettledPastBets.length, alert: unsettledPastBets.length > 0 },
    { id: 'history', label: 'History', count: settledBets.length },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700"
              >
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-800">Bets Dashboard</h1>
            </div>
            {stats && <BetStatsSummary stats={stats.overall} />}
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors relative ${
                  activeTab === tab.id
                    ? 'bg-gray-100 text-gray-800'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                    tab.alert
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Active Bets */}
        {activeTab === 'active' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Today&apos;s Active Bets
              </h2>
              <Link
                href="/"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add Bets
              </Link>
            </div>

            {activeBets.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center">
                <div className="text-gray-400 text-lg mb-2">No active bets</div>
                <p className="text-gray-500 text-sm mb-4">
                  Add bets from the main page to start tracking
                </p>
                <Link
                  href="/"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                >
                  Go to Games
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeBets.map(bet => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    onUpdate={loadData}
                    showSettleControls={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unsettled Past Bets */}
        {activeTab === 'unsettled' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Bets Needing Attention
              </h2>
              <p className="text-sm text-gray-500">
                These bets are from previous days and need to be marked as won/lost
              </p>
            </div>

            {unsettledPastBets.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center">
                <div className="text-green-500 text-4xl mb-2">✓</div>
                <div className="text-gray-600">All caught up!</div>
                <p className="text-gray-400 text-sm">No bets need attention</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {unsettledPastBets.map(bet => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    onUpdate={loadData}
                    showSettleControls={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* History */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <h2 className="text-lg font-semibold text-gray-800">Bet History</h2>

              <div className="flex items-center gap-3">
                {/* Result Filter */}
                <select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700"
                >
                  <option value="all">All Results</option>
                  <option value="won">Won Only</option>
                  <option value="lost">Lost Only</option>
                  <option value="push">Push Only</option>
                </select>

                {/* Date Filter */}
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as '7d' | '30d' | 'all')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700"
                >
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center">
                <div className="text-gray-400 text-lg mb-2">No bet history</div>
                <p className="text-gray-500 text-sm">
                  Settled bets will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map(bet => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    onUpdate={loadData}
                    showSettleControls={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {activeTab === 'stats' && (
          <div>
            {stats ? (
              <BetStatsDisplay stats={stats} />
            ) : (
              <div className="bg-white rounded-xl p-8 text-center">
                <div className="text-gray-400">Loading stats...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
