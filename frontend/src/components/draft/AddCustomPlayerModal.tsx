'use client';

import { useState } from 'react';
import { addCustomPlayer, type AddCustomPlayerBody } from '@/api/players';

const POSITION_OPTIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'P'];

type AddCustomPlayerModalProps = {
  leagueId: string;
  onSuccess: () => void;
  onClose: () => void;
};

export function AddCustomPlayerModal({
  leagueId,
  onSuccess,
  onClose,
}: AddCustomPlayerModalProps) {
  const [name, setName] = useState('');
  const [mlbTeam, setMlbTeam] = useState('');
  const [eligiblePositions, setEligiblePositions] = useState<string[]>([]);
  const [projectedValue, setProjectedValue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePosition = (pos: string) => {
    setEligiblePositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Player name is required');
      return;
    }
    if (eligiblePositions.length === 0) {
      setError('Select at least one position');
      return;
    }
    setSubmitting(true);
    try {
      const body: AddCustomPlayerBody = {
        name: name.trim(),
        mlbTeam: mlbTeam.trim() || undefined,
        eligiblePositions,
        projectedValue: projectedValue ? parseInt(projectedValue, 10) : undefined,
      };
      await addCustomPlayer(leagueId, body);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add player');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-custom-player-title"
    >
      <div className="bg-app-panel border border-app-border rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-app-border">
          <h2 id="add-custom-player-title" className="font-medium text-text-primary">
            Add Custom Player
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <p className="text-budget-critical text-sm" role="alert">
              {error}
            </p>
          )}
          <div>
            <label className="block text-text-secondary text-sm mb-1">Player Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Jackson Merrill"
            />
          </div>
          <div>
            <label className="block text-text-secondary text-sm mb-1">MLB Team</label>
            <input
              type="text"
              value={mlbTeam}
              onChange={(e) => setMlbTeam(e.target.value)}
              className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. SD"
            />
          </div>
          <div>
            <label className="block text-text-secondary text-sm mb-2">Position(s) *</label>
            <div className="flex flex-wrap gap-2">
              {POSITION_OPTIONS.map((pos) => (
                <label
                  key={pos}
                  className="flex items-center gap-1.5 rounded border border-app-border px-2 py-1.5 text-sm cursor-pointer hover:bg-app-dark"
                >
                  <input
                    type="checkbox"
                    checked={eligiblePositions.includes(pos)}
                    onChange={() => togglePosition(pos)}
                    className="rounded border-app-border text-primary focus:ring-primary"
                  />
                  {pos}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-text-secondary text-sm mb-1">Base Value (optional)</label>
            <input
              type="number"
              min={0}
              value={projectedValue}
              onChange={(e) => setProjectedValue(e.target.value)}
              className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-app-border bg-app-dark text-text-primary px-3 py-1.5 text-sm hover:bg-app-border/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary hover:bg-primary-hover text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
