'use client';

import Link from 'next/link';
import { useState } from 'react';
import { changePassword } from '@/api/auth';
import { useAuth } from '@/context/AuthContext';

const MIN_PASSWORD_LENGTH = 8;

export default function AccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess(data?.message ?? 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to change password.';
      setError(typeof msg === 'string' ? msg : 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-text-primary p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/dashboard" className="text-primary hover:underline text-sm">
          ← Back to Dashboard
        </Link>

        <section className="rounded-xl border border-app-border bg-app-panel p-5">
          <h1 className="text-2xl font-bold mb-2">Account</h1>
          <p className="text-text-secondary text-sm">Manage your credentials and account access.</p>
          <div className="mt-4 text-sm space-y-1">
            <p>
              <span className="text-text-secondary">Display Name:</span>{' '}
              <span className="font-medium">{user?.displayName ?? '—'}</span>
            </p>
            <p>
              <span className="text-text-secondary">Email:</span>{' '}
              <span className="font-medium">{user?.email ?? '—'}</span>
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-app-border bg-app-panel p-5">
          <h2 className="text-xl font-semibold mb-2">Change Password</h2>
          <p className="text-text-secondary text-sm mb-4">
            Updating your password refreshes your active session and invalidates older refresh tokens.
          </p>
          <form onSubmit={onSubmit} className="space-y-3">
            {error && (
              <p className="text-sm text-budget-critical" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-md border border-budget-safe/80 bg-budget-safe/10 px-3 py-2 text-sm">
                {success}
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary text-sm">Current Password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="rounded-lg border border-app-border bg-app-dark px-3 py-2 text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary text-sm">New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="rounded-lg border border-app-border bg-app-dark px-3 py-2 text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary text-sm">Confirm New Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="rounded-lg border border-app-border bg-app-dark px-3 py-2 text-text-primary"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
