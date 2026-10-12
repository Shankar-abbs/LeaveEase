'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';
import Link from 'next/link';

interface SettingsClientProps {
  profile: any;
  userEmail: string;
}

export default function SettingsClient({ profile, userEmail }: SettingsClientProps) {
  const router = useRouter();
  const supabase = getSupabaseClient();

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sign out state
  const [signingOut, setSigningOut] = useState(false);

  // Password validation rules
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumberOrSpecial = /[0-9!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = hasMinLength && hasUpper && hasLower && hasNumberOrSpecial && passwordsMatch;

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);

    if (!isFormValid) {
      setPasswordStatus({
        type: 'error',
        message: 'Please ensure all password requirements are met and passwords match.',
      });
      return;
    }

    setUpdatingPassword(true);

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordStatus({
        type: 'success',
        message: 'Password updated successfully! Please use your new password next time you log in.',
      });

      clientLogger.info('User updated password successfully', {
        userId: profile.id,
      });

      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordStatus({
        type: 'error',
        message: err.message || 'Failed to update password. Please try again.',
      });
      clientLogger.error('Failed to update password', err instanceof Error ? err : undefined);
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      if ('indexedDB' in window) {
        const dbs = await indexedDB.databases?.() ?? [];
        for (const db of dbs) {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }
      }
      router.push('/login');
    } catch (err) {
      clientLogger.error('Sign out error', err instanceof Error ? err : undefined);
      setSigningOut(false);
    }
  }

  const roleLabel =
    profile.role === 'hr_admin' ? 'HR Administrator' :
    profile.role === 'manager' ? 'Branch Manager' : 'Employee';

  const branchName = profile.branches?.name
    ? `${profile.branches.name} (${profile.branches.code}) - ${profile.branches.city}`
    : 'All Branches / Headquarters';

  const managerInfo = profile.manager?.full_name
    ? `${profile.manager.full_name} (${profile.manager.email})`
    : 'Direct HR Oversight / None';

  return (
    <AppShell profile={profile} activeRoute="/settings">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 bg-brand-500/10 border border-brand-500/20 rounded-xl text-brand-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            Account Settings & Security
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your personal profile details, credentials, and password security.
          </p>
        </div>

        {/* Profile Card */}
        <div className="card p-6 border border-slate-800 bg-slate-900/60 backdrop-blur space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-brand-500/20">
                {profile.full_name?.charAt(0) || 'U'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white" id="user-display-name">
                  {profile.full_name}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400 font-mono" id="user-display-email">{userEmail}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-500/10 text-brand-300 border border-brand-500/20">
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all shadow-sm"
              id="settings-signout-btn"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>{signingOut ? 'Signing out...' : 'Sign Out of Account'}</span>
            </button>
          </div>

          {/* Profile details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 block mb-1">Branch / Location</span>
              <span className="text-slate-200 font-medium">{branchName}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 block mb-1">Reporting Manager</span>
              <span className="text-slate-200 font-medium">{managerInfo}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400 block mb-1">Account Status</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active Employee
              </span>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="card p-6 border border-slate-800 bg-slate-900/60 backdrop-blur space-y-6" id="password-section">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Update Password
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Choose a strong, unique password to secure your account and leave management records.
            </p>
          </div>

          {passwordStatus && (
            <div
              className={`p-4 rounded-xl text-xs flex items-start gap-3 ${
                passwordStatus.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
              id="password-status-message"
            >
              {passwordStatus.type === 'success' ? (
                <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div>
                <p className="font-semibold">{passwordStatus.type === 'success' ? 'Success' : 'Error'}</p>
                <p className="mt-0.5">{passwordStatus.message}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="new-password">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                id="confirm-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                className="input w-full"
              />
            </div>

            {/* Live Password Checklist */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
              <span className="font-semibold text-slate-300 block">Password Requirements:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${hasMinLength ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>✓</span>
                  At least 8 characters
                </div>
                <div className={`flex items-center gap-2 ${hasUpper ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${hasUpper ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>✓</span>
                  Uppercase letter (A-Z)
                </div>
                <div className={`flex items-center gap-2 ${hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${hasLower ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>✓</span>
                  Lowercase letter (a-z)
                </div>
                <div className={`flex items-center gap-2 ${hasNumberOrSpecial ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${hasNumberOrSpecial ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>✓</span>
                  Number or symbol (0-9, !@#$)
                </div>
              </div>
              {newPassword.length > 0 && confirmPassword.length > 0 && (
                <div className={`text-[11px] pt-1 flex items-center gap-2 ${passwordsMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span>{passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={updatingPassword || !isFormValid}
              className="btn-primary w-full sm:w-auto"
              id="submit-password-btn"
            >
              {updatingPassword ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  <span>Updating Password...</span>
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </div>

        {/* Additional Settings & Diagnostics */}
        <div className="card p-6 border border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
          <h2 className="text-base font-bold text-white">System Diagnostics & Offline Sync</h2>
          <p className="text-xs text-slate-400">
            LeaveEase is a Progressive Web App (PWA). Check offline queue status, cache health, and synchronization diagnostics.
          </p>
          <div className="pt-2">
            <Link
              href="/settings/diagnostics"
              className="btn-secondary text-xs inline-flex items-center gap-2"
              id="view-diagnostics-btn"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Open PWA & System Diagnostics
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
