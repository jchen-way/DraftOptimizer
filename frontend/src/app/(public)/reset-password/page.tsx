'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { resetPassword } from '@/api/auth';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!token) {
      setError('Missing reset token. Please request a new password reset link.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password, confirmPassword);
      setSuccess('Password reset successful. Redirecting to dashboard...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 900);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to reset password.';
      setError(typeof msg === 'string' ? msg : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-text-primary flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-app-border bg-app-panel/90 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Create New Password</h1>
        <p className="text-text-secondary text-sm mb-6">
          Enter a new password for your account.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-budget-critical text-sm" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md border border-budget-safe/80 bg-budget-safe/10 px-3 py-2 text-sm">
              {success}
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-sm">New Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-lg border border-app-border bg-app-dark px-3 py-2 text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-sm">Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-lg border border-app-border bg-app-dark px-3 py-2 text-text-primary"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !token}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Reset Password'}
          </button>
        </form>

        {!token && (
          <p className="mt-4 text-sm text-budget-caution">
            Reset token missing. Request a new link from the forgot password page.
          </p>
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
