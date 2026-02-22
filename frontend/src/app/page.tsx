'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import LandingBackground from '@/components/LandingBackground';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-app-dark text-text-primary">
      {/* Animated canvas background */}
      <LandingBackground />

      {/* Static radial gradients layered on top of canvas */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 12% 15%, rgba(30,201,166,0.13) 0%, transparent 38%),
            radial-gradient(circle at 88% 8%, rgba(125,211,252,0.10) 0%, transparent 34%),
            radial-gradient(ellipse at 85% 90%, rgba(30,201,166,0.07) 0%, transparent 50%)
          `,
        }}
        aria-hidden="true"
      />

      {/* ── Nav ────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <span className="text-xl font-bold tracking-tight text-text-primary">
          DraftOptimizer
        </span>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-app-border bg-app-panel px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-primary/50 hover:bg-app-panel"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────── */}
      <main className="relative z-10 flex min-h-[calc(100vh-72px)] flex-col items-center justify-center px-6 md:px-10">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

          {/* Left column — copy */}
          <div className="space-y-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Shadow Draft Intelligence
              </span>
            </div>

            <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">
              Track every pick
              <br />
              in real time and
              <br />
              <span
                style={{
                  background: 'linear-gradient(90deg, #1ec9a6 0%, #7dd3fc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                outmaneuver your league.
              </span>
            </h1>

            <p className="max-w-md text-lg leading-relaxed text-text-secondary">
              Log picks from Yahoo/ESPN/CBS, monitor all opponent budgets, and react
              with fast draft insights during auction chaos.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={user ? '/dashboard' : '/register'}
                className="rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover hover:shadow-primary/30 hover:shadow-xl"
              >
                Start Free Setup
              </Link>
              {user && (
                <Link
                  href="/draft"
                  className="rounded-lg border border-app-border bg-app-panel/60 px-6 py-3 text-base font-medium text-text-primary backdrop-blur-sm transition-colors hover:border-primary/40"
                >
                  Continue Draft Session
                </Link>
              )}
            </div>
          </div>

          {/* Right column — workflow card */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-app-border bg-app-panel/70 p-6 backdrop-blur-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-secondary">
                Core Workflow
              </p>
              <div className="space-y-3">
                {[
                  { step: '01', text: 'Configure your league settings and teams.' },
                  { step: '02', text: 'Enter keepers and opening budgets.' },
                  { step: '03', text: 'Log picks: Player → Team → Price.' },
                  { step: '04', text: 'Watch budgets, history, and roster shifts update instantly.' },
                ].map(({ step, text }) => (
                  <div
                    key={step}
                    className="flex items-start gap-4 rounded-lg border border-app-border bg-app-dark/60 px-4 py-3"
                  >
                    <span className="mt-0.5 shrink-0 text-xs font-bold text-primary/60">
                      {step}
                    </span>
                    <span className="text-sm leading-snug text-text-secondary">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Pick Latency', value: '<500ms' },
                { label: 'Players Tracked', value: '1,000+' },
                { label: 'Budget Accuracy', value: '100%' },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-app-border bg-app-panel/50 px-4 py-3 text-center backdrop-blur-sm"
                >
                  <p className="text-lg font-bold text-primary">{value}</p>
                  <p className="text-xs text-text-secondary">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
