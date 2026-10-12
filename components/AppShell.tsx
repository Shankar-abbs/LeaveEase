'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';
import { useState } from 'react';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface AppShellProps {
  profile: Profile | null;
  activeRoute: string;
  children: React.ReactNode;
}

const NAV_ITEMS_EMPLOYEE = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/team-calendar', label: 'Team', icon: 'calendar' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const NAV_ITEMS_MANAGER = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/approvals', label: 'Approvals', icon: 'check' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/team-calendar', label: 'Team', icon: 'calendar' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const NAV_ITEMS_HR = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/approvals', label: 'Approvals', icon: 'check' },
  { href: '/team-calendar', label: 'Team', icon: 'calendar' },
  { href: '/admin', label: 'Admin', icon: 'admin' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = `w-5 h-5 ${className ?? ''}`;
  switch (icon) {
    case 'home':
      return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
    case 'check':
      return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
    case 'history':
      return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'calendar':
      return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case 'admin':
      return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case 'settings':
      return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
    default:
      return null;
  }
}

export default function AppShell({ profile, activeRoute, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  // Clear navigation loading indicator once page updates
  useState(() => {
    setNavigatingTo(null);
  });

  const role = profile?.role ?? 'employee';
  const navItems = role === 'hr_admin' ? NAV_ITEMS_HR :
                   role === 'manager'  ? NAV_ITEMS_MANAGER :
                   NAV_ITEMS_EMPLOYEE;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
      clientLogger.info('User signed out');
      // Clear all local data on logout
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

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top bar — desktop */}
      <header className="hidden md:flex items-center justify-between h-16 px-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40 relative">
        {/* Animated navigation progress bar */}
        {navigatingTo && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-500 via-indigo-400 to-emerald-400 w-full animate-pulse" />
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-600/20 border border-brand-500/30 p-2">
            <svg className="w-5 h-5 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight">LeaveEase</span>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (pathname !== item.href) setNavigatingTo(item.href);
              }}
              className={`nav-item flex-row gap-2 px-4 ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'nav-item-active' : ''}`}
            >
              <NavIcon icon={item.icon} />
              <span className="text-sm">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="text-right group hover:opacity-90 transition block"
            title="Account Settings"
            id="header-settings-link"
          >
            <div className="text-sm font-medium text-slate-200 group-hover:text-brand-300 transition flex items-center justify-end gap-1.5">
              <span>{profile?.full_name || 'User'}</span>
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="text-xs text-slate-400 capitalize">{profile?.role?.replace('_', ' ') || 'employee'}</div>
          </Link>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/40 transition-all shadow-sm"
            title="Sign out of LeaveEase"
            id="sign-out-btn"
          >
            {signingOut ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <span>Signing out…</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span>Sign Out</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Top bar — mobile */}
      <header className="flex md:hidden items-center justify-between h-14 px-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-brand-600/20 border border-brand-500/30 p-1.5">
            <svg className="w-4 h-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-white">LeaveEase</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 truncate max-w-[120px]">{profile?.full_name?.split(' ')[0]}</span>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/40 transition"
            id="mobile-sign-out-btn"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="md:pb-0 pb-20">
        {children}
      </main>

      {/* Bottom Navigation — mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 px-2 pb-safe"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-around py-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (pathname !== item.href) setNavigatingTo(item.href);
                }}
                id={`nav-${item.label.toLowerCase()}`}
                className={`nav-item flex-col flex-1 ${isActive ? 'nav-item-active' : ''}`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <NavIcon icon={item.icon} className={isActive ? 'text-brand-400' : ''} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
