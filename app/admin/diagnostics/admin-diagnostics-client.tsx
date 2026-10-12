'use client';

import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { getSupabaseClient } from '@/lib/supabase/client';

interface AppLog {
  id: string;
  level: string;
  service: string;
  request_id?: string;
  user_id?: string;
  action?: string;
  message: string;
  context?: Record<string, any>;
  at: string;
}

interface AdminDiagnosticsClientProps {
  profile: any;
  initialLogs: AppLog[];
}

export default function AdminDiagnosticsClient({
  profile,
  initialLogs,
}: AdminDiagnosticsClientProps) {
  const [logs, setLogs] = useState<AppLog[]>(initialLogs);
  const [loading, setLoading] = useState(false);
  const [searchRequestId, setSearchRequestId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const supabase = getSupabaseClient();

  async function refreshLogs() {
    setLoading(true);
    try {
      let query = supabase.from('app_logs').select('*').order('at', { ascending: false }).limit(50);
      if (selectedLevel !== 'all') {
        query = query.eq('level', selectedLevel);
      }
      if (searchRequestId.trim()) {
        query = query.eq('request_id', searchRequestId.trim());
      }
      const { data, error } = await query;
      if (!error && data) {
        setLogs(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function checkSystemHealth() {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthStatus(data);
    } catch (err: any) {
      setHealthStatus({ status: 'error', error: err.message });
    } finally {
      setCheckingHealth(false);
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
    if (searchRequestId.trim() && log.request_id !== searchRequestId.trim()) return false;
    return true;
  });

  return (
    <AppShell profile={profile} activeRoute="/admin">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-xs text-brand-400 hover:underline">
                ← Admin Home
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">System Diagnostics</h1>
            <p className="text-sm text-slate-400">
              Observability, error logs, and health status for HR administrators
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={checkSystemHealth}
              disabled={checkingHealth}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              id="ping-health-btn"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {checkingHealth ? 'Checking...' : 'Check /api/health'}
            </button>
            <button
              onClick={refreshLogs}
              disabled={loading}
              className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
              id="refresh-logs-btn"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Refreshing...' : 'Refresh Logs'}
            </button>
          </div>
        </div>

        {/* Health status banner */}
        {healthStatus && (
          <div className={`card p-4 border ${healthStatus.status === 'ok' ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-red-500/30 bg-red-950/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${healthStatus.status === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    System Health: <span className="uppercase">{healthStatus.status}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Version: <code className="text-brand-300">{healthStatus.version}</code> | Latency: {healthStatus.durationMs}ms
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHealthStatus(null)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card p-4 flex flex-wrap items-center gap-3 bg-slate-900/60 border-slate-800">
          <div className="flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder="Filter by Request ID (UUID)..."
              value={searchRequestId}
              onChange={(e) => setSearchRequestId(e.target.value)}
              className="input text-xs w-full font-mono"
              id="filter-request-id"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {['all', 'error', 'warn', 'info'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  selectedLevel === lvl
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white bg-slate-800/50'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Logs List */}
        <div className="card divide-y divide-slate-800">
          <div className="p-4 bg-slate-900/70 rounded-t-2xl flex items-center justify-between text-xs text-slate-400">
            <span>Recent Application Logs (app_logs)</span>
            <span>Showing {filteredLogs.length} events</span>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              No matching log records found in app_logs.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const levelColor =
                log.level === 'error'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : log.level === 'warn'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

              return (
                <div key={log.id} className="p-4 hover:bg-slate-800/30 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${levelColor}`}>
                        {log.level}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">[{log.service}]</span>
                      {log.action && (
                        <span className="text-xs text-brand-400 font-mono">{log.action}</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(log.at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 mt-2 font-mono break-all">{log.message}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                    <div>
                      {log.request_id && (
                        <span>
                          ReqID: <code className="text-slate-300 font-mono">{log.request_id}</code>
                        </span>
                      )}
                    </div>
                    {log.context && Object.keys(log.context).length > 0 && (
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-brand-400 hover:underline"
                      >
                        {isExpanded ? 'Hide context' : 'View context'}
                      </button>
                    )}
                  </div>

                  {isExpanded && log.context && (
                    <pre className="mt-3 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                      {JSON.stringify(log.context, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
