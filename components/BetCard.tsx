'use client';

import { useState } from 'react';
import { StoredBet, BetStatus, BetType, BetHalf, updateBet, settleBet, removeBet } from '@/lib/betStorage';

interface BetCardProps {
  bet: StoredBet;
  onUpdate: () => void; // Callback to refresh parent state
  showSettleControls?: boolean;
  compact?: boolean;
}

export function BetCard({ bet, onUpdate, showSettleControls = true, compact = false }: BetCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    betType: bet.betType,
    line: bet.line,
    team: bet.team || '',
    half: bet.half,
    toWin: bet.toWin,
    notes: bet.notes || '',
  });

  const handleSaveEdit = () => {
    updateBet(bet.id, {
      betType: editForm.betType,
      line: editForm.line,
      team: editForm.team || undefined,
      half: editForm.half,
      toWin: editForm.toWin,
      notes: editForm.notes || undefined,
      isVerified: true,
    });
    setIsEditing(false);
    onUpdate();
  };

  const handleSettle = (result: 'won' | 'lost' | 'push' | 'void') => {
    settleBet(bet.id, result);
    onUpdate();
  };

  const handleDelete = () => {
    if (confirm('Delete this bet? This cannot be undone.')) {
      removeBet(bet.id);
      onUpdate();
    }
  };

  const getBetDisplay = () => {
    if (bet.betType === 'spread' && bet.team) {
      return `${bet.team} ${bet.line > 0 ? '+' : ''}${bet.line}`;
    }
    return `${bet.betType.charAt(0).toUpperCase() + bet.betType.slice(1)} ${bet.line}`;
  };

  const getStatusBadge = () => {
    const badges: Record<BetStatus, { bg: string; text: string; label: string }> = {
      active: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Active' },
      won: { bg: 'bg-green-100', text: 'text-green-700', label: 'Won' },
      lost: { bg: 'bg-red-100', text: 'text-red-700', label: 'Lost' },
      push: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Push' },
      void: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Void' },
    };
    const badge = badges[bet.status];
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getHalfBadge = () => {
    const colors: Record<BetHalf, string> = {
      '1st': 'bg-purple-100 text-purple-700',
      '2nd': 'bg-indigo-100 text-indigo-700',
      full: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[bet.half]}`}>
        {bet.half === 'full' ? 'Full Game' : `${bet.half} Half`}
      </span>
    );
  };

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-2 rounded-lg border ${
        bet.status === 'won' ? 'border-green-300 bg-green-50' :
        bet.status === 'lost' ? 'border-red-300 bg-red-50' :
        bet.status === 'push' ? 'border-gray-300 bg-gray-50' :
        'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <span className="font-medium text-gray-800">{getBetDisplay()}</span>
          {getHalfBadge()}
        </div>
        <span className="text-sm text-gray-500">${bet.toWin.toFixed(2)}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${
      bet.status === 'won' ? 'border-green-300 bg-green-50' :
      bet.status === 'lost' ? 'border-red-300 bg-red-50' :
      bet.status === 'push' ? 'border-gray-300 bg-gray-50' :
      'border-gray-200 bg-white'
    }`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {getHalfBadge()}
          {bet.isVerified && (
            <span className="text-green-500 text-xs" title="Verified">✓</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{bet.date}</span>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-gray-400 hover:text-blue-500 text-sm"
            title="Edit bet"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-500 text-sm"
            title="Delete bet"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="p-4 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bet Type</label>
              <select
                value={editForm.betType}
                onChange={(e) => setEditForm({ ...editForm, betType: e.target.value as BetType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
              >
                <option value="spread">Spread</option>
                <option value="over">Over</option>
                <option value="under">Under</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Line</label>
              <input
                type="number"
                step="0.5"
                value={editForm.line}
                onChange={(e) => setEditForm({ ...editForm, line: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
              />
            </div>
          </div>

          {editForm.betType === 'spread' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Team</label>
              <input
                type="text"
                value={editForm.team}
                onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Half</label>
              <select
                value={editForm.half}
                onChange={(e) => setEditForm({ ...editForm, half: e.target.value as BetHalf })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
              >
                <option value="1st">1st Half</option>
                <option value="2nd">2nd Half</option>
                <option value="full">Full Game</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To Win ($)</label>
              <input
                type="number"
                step="0.01"
                value={editForm.toWin}
                onChange={(e) => setEditForm({ ...editForm, toWin: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              type="text"
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveEdit}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Save Changes
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          {/* Matchup */}
          <div className="text-xs text-gray-500 mb-1">
            {bet.awayTeam} @ {bet.homeTeam}
          </div>

          {/* Bet Details */}
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold text-gray-800">
              {getBetDisplay()}
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-green-600">${bet.toWin.toFixed(2)}</div>
              <div className="text-xs text-gray-400">to win</div>
            </div>
          </div>

          {/* Notes */}
          {bet.notes && (
            <div className="mt-2 text-sm text-gray-500 italic">
              {bet.notes}
            </div>
          )}

          {/* Actual Score (if settled) */}
          {bet.actualScore && (
            <div className="mt-2 text-sm text-gray-600">
              Final: {bet.actualScore.away} - {bet.actualScore.home}
            </div>
          )}
        </div>
      )}

      {/* Settle Controls */}
      {showSettleControls && bet.status === 'active' && !isEditing && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Mark as:</div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSettle('won')}
              className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Won
            </button>
            <button
              onClick={() => handleSettle('lost')}
              className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Lost
            </button>
            <button
              onClick={() => handleSettle('push')}
              className="flex-1 px-3 py-1.5 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600"
            >
              Push
            </button>
            <button
              onClick={() => handleSettle('void')}
              className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600"
            >
              Void
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
