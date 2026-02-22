'use client';

import Link from 'next/link';
import { useState } from 'react';
import { forgotPassword } from '@/api/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setResetUrl(null);
    setSubmitting(true);
    try {
      const { data } = await forgotPassword(email);
      setMessage(data?.message ?? 'If that email exists, we sent a reset link.');
      if (typeof data?.resetUrl === 'string' && data.resetUrl) {
        setResetUrl(data.resetUrl);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to start password reset.';
      setError(typeof msg === 'string' ? msg : 'Failed to start password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-text-primary flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-app-border bg-app-panel/90 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Reset Your Password</h1>
        <p className="text-text-secondary text-sm mb-6">
          Enter your email address and we&apos;ll send reset instructions.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-budget-critical text-sm" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-md border border-budget-safe/80 bg-budget-safe/10 px-3 py-2 text-sm">
              {message}
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
              className="rounded-lg border border-app-border bg-app-dark px-3 py-2 text-text-primary"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {resetUrl && (
          <div className="mt-4 rounded-md border border-budget-caution/70 bg-budget-caution/10 px-3 py-2 text-sm">
            <p className="text-text-primary">Development reset link:</p>
            <Link href={resetUrl} className="text-primary underline break-all">
              {resetUrl}
            </Link>
          </div>
        )}

        <p className="mt-4 text-sm text-text-secondary">
          Back to{' '}
          <Link href="/login" className="text-primary hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
