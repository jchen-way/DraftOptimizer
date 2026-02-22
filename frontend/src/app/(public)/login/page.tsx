'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setReason(params.get('reason'));
  }, []);
  const sessionMessage =
    reason === 'session-expired'
      ? 'Your session expired. Please sign in again.'
      : reason === 'auth-required'
        ? 'Please sign in to continue.'
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : 'Login failed';
      setError(typeof message === 'string' ? message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen text-text-primary flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-app-border bg-app-panel/90 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Welcome Back</h1>
        <p className="text-text-secondary text-sm mb-6">
          Sign in to continue your draft workspace.
        </p>
        {sessionMessage && (
          <p className="mb-4 rounded-md border border-budget-caution/60 bg-budget-caution/10 px-3 py-2 text-sm text-budget-caution">
            {sessionMessage}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <p className="text-budget-critical text-sm" role="alert">
              {error}
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-sm">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-app-panel border border-app-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-sm">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-app-panel border border-app-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-3 text-sm text-text-secondary">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
        </p>
        <p className="mt-4 text-text-secondary text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-primary hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
