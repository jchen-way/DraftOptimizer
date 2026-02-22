'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { deleteLeague, getLeagues, type League } from '@/api/leagues';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);
  const hasLeagues = leagues.length > 0;

  useEffect(() => {
    getLeagues()
      .then(({ data }) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load leagues'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDeleteLeague = async (leagueId: string) => {
    if (!leagueId) return;
    const confirmed = window.confirm(
      'Delete this league and all associated teams, players, and draft history? This cannot be undone.'
    );
    if (!confirmed) return;

    setDeletingLeagueId(leagueId);
    setError(null);
    try {
      await deleteLeague(leagueId);
      setLeagues((prev) =>
        prev.filter((league) => {
          const id =
            (league as { id?: string; _id?: string }).id ??
            (league as { _id?: string })._id ??
            '';
          return id !== leagueId;
        })
      );
    } catch {
      setError('Failed to delete league');
    } finally {
      setDeletingLeagueId(null);
    }
  };

  return (
    <div className="min-h-screen text-text-primary p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-text-secondary text-sm">Signed in as {user?.displayName ?? user?.email ?? 'User'}</p>
            <h1 className="text-2xl font-bold">Your Leagues</h1>
            <Link href="/account" className="text-sm text-primary hover:underline">
              Account Settings
            </Link>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg border border-app-border bg-app-panel px-3 py-2 text-sm font-medium text-text-primary hover:bg-app-dark disabled:opacity-50"
          >
            {loggingOut ? 'Signing out...' : 'Logout'}
          </button>
        </div>
        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-app-border bg-app-panel px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Leagues</p>
            <p className="text-2xl font-semibold">{leagues.length}</p>
            <p className="text-xs text-text-secondary">
              {hasLeagues ? 'Ready to open or configure.' : 'Create your first league to begin.'}
            </p>
          </div>
          <div className="rounded-lg border border-app-border bg-app-panel px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Draft Status</p>
            <p className="text-2xl font-semibold">{hasLeagues ? 'Configured' : 'Not Started'}</p>
            <p className="text-xs text-text-secondary">Setup teams, load players, and enter keepers.</p>
          </div>
          <div className="rounded-lg border border-app-border bg-app-panel px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Next Action</p>
            <p className="text-2xl font-semibold">{hasLeagues ? 'Open Draft' : 'Create League'}</p>
            <p className="text-xs text-text-secondary">You can always edit settings later.</p>
          </div>
        </section>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/config"
            className="inline-block rounded-lg bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4 transition-colors"
          >
            Create New League
          </Link>
          <p className="text-sm text-text-secondary">
            {hasLeagues ? 'Select a league below to continue where you left off.' : 'Start with league basics, then teams and player pool.'}
          </p>
        </div>
        {loading && (
          <p className="text-text-secondary">Loading leagues...</p>
        )}
        {error && (
          <p className="text-budget-critical" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && (
          hasLeagues ? (
            <ul className="space-y-3">
              {leagues.map((league) => {
                const id = (league as { id?: string; _id?: string }).id ?? (league as { _id?: string })._id ?? '';
                return (
                  <li
                    key={id}
                    className="bg-app-panel border border-app-border rounded-lg px-4 py-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className="font-medium">{league.name}</span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/draft?leagueId=${id}`}
                        aria-disabled={deletingLeagueId === id}
                        className={`rounded-lg bg-primary text-white font-medium py-1.5 px-3 text-sm transition-colors ${
                          deletingLeagueId === id
                            ? 'pointer-events-none opacity-50'
                            : 'hover:bg-primary-hover'
                        }`}
                      >
                        Open Draft
                      </Link>
                      <Link
                        href={`/config?leagueId=${id}`}
                        aria-disabled={deletingLeagueId === id}
                        className={`rounded-lg border border-app-border bg-app-dark px-3 py-1.5 text-sm text-text-primary transition-colors ${
                          deletingLeagueId === id
                            ? 'pointer-events-none opacity-50'
                            : 'hover:bg-app-border'
                        }`}
                      >
                        Configure
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteLeague(id)}
                        disabled={deletingLeagueId === id}
                        className="ml-1 rounded-lg border border-budget-critical/70 bg-budget-critical/10 px-3 py-1.5 text-sm text-budget-critical hover:bg-budget-critical/20 disabled:opacity-50"
                      >
                        {deletingLeagueId === id ? 'Deleting…' : 'Delete League'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyLeagueState />
          )
        )}
      </div>
    </div>
  );
}

function EmptyLeagueState() {
  const steps = [
    'Create your league (budget, roster slots, scoring).',
    'Add teams and mark your own team.',
    'Load sample players or import your own player file.',
    'Enter keepers and launch the draft war room.',
  ];

  return (
    <section className="rounded-2xl border border-app-border bg-app-panel/80 p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold mb-2">No leagues yet</h2>
          <p className="text-text-secondary mb-4 max-w-xl">
            Your dashboard will fill with active leagues, draft links, and budget tracking once you create your first league.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-app-border bg-app-dark/60 px-3 py-3">
              <p className="text-sm font-medium">Keeper Entry</p>
              <p className="text-xs text-text-secondary">Capture pre-draft keepers and costs before main auction.</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-dark/60 px-3 py-3">
              <p className="text-sm font-medium">Player Pool</p>
              <p className="text-xs text-text-secondary">Load 100+ sample players or import your custom projections.</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-dark/60 px-3 py-3">
              <p className="text-sm font-medium">Live Draft Tracking</p>
              <p className="text-xs text-text-secondary">Update picks, budgets, roster positions, and scarcity in real time.</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-dark/60 px-3 py-3">
              <p className="text-sm font-medium">Export & History</p>
              <p className="text-xs text-text-secondary">Review last picks and export logs for post-draft analysis.</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
          <h3 className="font-semibold mb-3">Quick Start</h3>
          <ol className="space-y-2 text-sm text-text-secondary">
            {steps.map((step, index) => (
              <li key={step} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-dark text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/config"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Start League Setup
          </Link>
        </div>
      </div>
    </section>
  );
}
