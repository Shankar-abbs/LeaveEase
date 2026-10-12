'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = getSupabaseClient();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        clientLogger.warn('Login failed', { action: 'login', code: signInError.status });
        setLoading(false);
        return;
      }

      if (data.user) {
        setRedirecting(true);
        clientLogger.info('Login successful', { action: 'login' });
        router.push(redirectTo);
        // Keep loading animation alive during route push
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      clientLogger.error('Login error', err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    }
  }

  const isProcessing = loading || redirecting;

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-brand-950/30 to-slate-950">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-2xl bg-brand-600/20 border border-brand-500/30 p-4 mb-4 backdrop-blur-sm">
            <svg className="w-10 h-10 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">LeaveEase</h1>
          <p className="text-slate-400 text-sm mt-1">Kestrel Logistics — Sign in to continue</p>
        </div>

        {/* Form Card */}
        <div className="card p-6 shadow-2xl relative overflow-hidden">
          {/* Top animated progress bar when processing */}
          {isProcessing && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-500 via-indigo-400 to-brand-500 w-full animate-pulse" />
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5" id="login-form">
            <div>
              <label htmlFor="email" className="label">
                Work Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@kestrellogistics.com"
                disabled={isProcessing}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••••"
                disabled={isProcessing}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              id="login-submit"
              className="btn-primary w-full mt-2 relative"
              disabled={isProcessing}
            >
              {redirecting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Loading Workspace…</span>
                </span>
              ) : loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Signing in…</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Contact HR if you need access. Public sign-up is disabled.
          </p>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-slate-600 mt-6">
          LeaveEase v{process.env.NEXT_PUBLIC_APP_VERSION || 'local'}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-slate-400">Loading…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
