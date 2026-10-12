'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { getOutbox, getDB, clearAllLocalData, type OutboxEntry } from '@/lib/offline/outbox';
import { useSync } from '@/lib/offline/useSync';
import { redact } from '@/lib/redact';

interface SettingsDiagnosticsClientProps {
  user: any;
  profile: any;
}

export default function SettingsDiagnosticsClient({
  user,
  profile,
}: SettingsDiagnosticsClientProps) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [dbCleared, setDbCleared] = useState(false);

  const { flush } = useSync();

  async function loadOutboxEntries() {
    try {
      if (typeof window !== 'undefined') {
        const outbox = getOutbox();
        const all = await outbox.toArray();
        setEntries(all);
      }
    } catch {
      // IndexedDB might be unavailable or private mode
    }
  }

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void loadOutboxEntries();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function handleManualSync() {
    setFlushing(true);
    try {
      await flush();
      await loadOutboxEntries();
    } finally {
      setFlushing(false);
    }
  }

  async function handleClearStorage() {
    if (confirm('Clear offline storage? Any unsynced changes in your outbox will be deleted.')) {
      await clearAllLocalData();
      await loadOutboxEntries();
      setDbCleared(true);
      setTimeout(() => setDbCleared(false), 3000);
    }
  }

  async function handleCopyDebugInfo() {
    const rawDebugData = {
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'local',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      onlineStatus: navigator.onLine,
      userId: user?.id,
      role: profile?.role,
      outboxEntriesCount: entries.length,
      outboxSummary: entries.map((e) => ({
        id: e.id,
        op: e.op,
        status: e.status,
        attempts: e.attempts,
        createdAt: e.createdAt,
        error: e.error,
        payload: e.payload,
      })),
    };

    // Strictly redact PII and leave reasons before copying
    const safeData = redact(rawDebugData);

    try {
      await navigator.clipboard.writeText(JSON.stringify(safeData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }

  const queuedCount = entries.filter((e) => e.status === 'queued').length;
  const failedCount = entries.filter((e) => e.status === 'failed').length;
  const doneCount = entries.filter((e) => e.status === 'done').length;

  return (
    <AppShell profile={profile} activeRoute="/settings/diagnostics">
      <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Diagnostics & Offline Storage</h1>
          <p className="text-sm text-slate-400 mt-1">
            Check local offline outbox status, sync health, and export diagnostic logs
          </p>
        </div>

        {/* Status card */}
        <div className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 mb-1">Network</div>
            <div className={`text-sm font-bold flex items-center justify-center gap-1.5 ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 mb-1">Queued</div>
            <div className="text-sm font-bold text-amber-300 font-mono">{queuedCount}</div>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 mb-1">Needs Attention</div>
            <div className="text-sm font-bold text-red-300 font-mono">{failedCount}</div>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 mb-1">Synced</div>
            <div className="text-sm font-bold text-slate-300 font-mono">{doneCount}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleManualSync}
            disabled={flushing || !isOnline}
            className="btn-primary text-xs py-2 px-4 flex items-center gap-2"
            id="manual-sync-btn"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {flushing ? 'Syncing...' : 'Sync Now'}
          </button>

          <button
            onClick={handleCopyDebugInfo}
            className="btn-secondary text-xs py-2 px-4 flex items-center gap-2"
            id="copy-debug-btn"
          >
            <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            {copied ? 'Copied (Redacted) ✓' : 'Copy Debug Info'}
          </button>

          <button
            onClick={handleClearStorage}
            className="btn-ghost text-xs py-2 px-4 text-red-400 hover:text-red-300 ml-auto border border-red-900/30 hover:border-red-500/50"
            id="clear-storage-btn"
          >
            Clear Local Cache
          </button>
        </div>

        {dbCleared && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-xl">
            Offline database cleared.
          </div>
        )}

        {/* Local Outbox List */}
        <div className="card divide-y divide-slate-800">
          <div className="p-4 bg-slate-900/70 rounded-t-2xl flex items-center justify-between text-xs text-slate-400">
            <span>Offline Operations Queue (IndexedDB Outbox)</span>
            <span>{entries.length} items</span>
          </div>

          {entries.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              Your offline outbox is empty. All operations are in sync with the server.
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        entry.status === 'done'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : entry.status === 'failed'
                          ? 'bg-red-500/20 text-red-300'
                          : entry.status === 'syncing'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {entry.status}
                    </span>
                    <span className="text-xs font-semibold text-white font-mono">{entry.op}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono truncate">
                  Idempotency Key: {entry.id}
                </div>

                {entry.error && (
                  <div className="p-2.5 rounded bg-red-950/40 border border-red-500/30 text-xs text-red-300 font-mono">
                    {entry.error}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
