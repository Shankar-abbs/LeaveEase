'use client';

import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';
import { displayDateRange } from '@/lib/dates';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Manager {
  id: string;
  full_name: string;
  email: string;
}

interface PolicySettings {
  id?: string;
  auto_approve_below_days: number;
  weekly_off_days: number[];
  timezone: string;
}

interface ReportRow {
  employee_name: string;
  email: string;
  branch_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  decided_at?: string;
}

interface AdminClientProps {
  profile: any;
  initialPolicy: PolicySettings;
  branches: Branch[];
  managers: Manager[];
}

export default function AdminClient({
  profile,
  initialPolicy,
  branches,
  managers,
}: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<'policies' | 'invite' | 'report'>('policies');
  const [policy, setPolicy] = useState<PolicySettings>(initialPolicy);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteBranch, setInviteBranch] = useState(branches[0]?.id || '');
  const [inviteManager, setInviteManager] = useState('');
  const [inviteRole, setInviteRole] = useState<'employee' | 'manager' | 'hr_admin'>('employee');
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  // CSV Import state
  const [csvText, setCsvText] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

  // Report state
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportLoaded, setReportLoaded] = useState(false);

  const supabase = getSupabaseClient();

  // Save policy settings
  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setSavingPolicy(true);
    setPolicyMessage(null);

    try {
      const { error } = await supabase
        .from('policy_settings')
        .update({
          auto_approve_below_days: policy.auto_approve_below_days,
          weekly_off_days: policy.weekly_off_days,
          timezone: policy.timezone,
        })
        .match({}); // update single row

      if (error) throw error;
      setPolicyMessage('Policies saved successfully!');
      clientLogger.info('Policy settings updated', { auto_approve: policy.auto_approve_below_days });
    } catch (err) {
      setPolicyMessage('Failed to save policy settings');
      clientLogger.error('Failed to save policy settings', err instanceof Error ? err : undefined);
    } finally {
      setSavingPolicy(false);
    }
  }

  // Invite user (creates profile row)
  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteStatus(null);

    try {
      // In production/staging, invitations call supabase auth invite or an edge function
      // For this demo, insert directly into profiles (or trigger auth flow)
      const { error } = await supabase.from('profiles').insert({
        email: inviteEmail.trim().toLowerCase(),
        full_name: inviteName.trim(),
        branch_id: inviteBranch,
        manager_id: inviteManager || null,
        role: inviteRole,
        active: true,
      });

      if (error) throw error;

      setInviteStatus(`Success: Invited ${inviteName} (${inviteEmail})`);
      setInviteEmail('');
      setInviteName('');
    } catch (err: any) {
      setInviteStatus(`Error: ${err.message || 'Failed to invite user'}`);
    } finally {
      setInviting(false);
    }
  }

  // Bulk CSV Import
  async function handleCsvImport() {
    if (!csvText.trim()) return;
    setCsvImporting(true);
    setCsvResult(null);

    try {
      const lines = csvText.trim().split('\n');
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || (i === 0 && line.toLowerCase().includes('email'))) continue; // skip header

        const [email, fullName, branchCode, managerEmail, role] = line.split(',').map((s) => s.trim());
        if (!email || !fullName) continue;

        const branch = branches.find((b) => b.code.toUpperCase() === (branchCode || '').toUpperCase());
        const mgr = managers.find((m) => m.email.toLowerCase() === (managerEmail || '').toLowerCase());

        const { error } = await supabase.from('profiles').insert({
          email: email.toLowerCase(),
          full_name: fullName,
          branch_id: branch?.id || branches[0]?.id,
          manager_id: mgr?.id || null,
          role: role === 'manager' || role === 'hr_admin' ? role : 'employee',
          active: true,
        });

        if (error) errorCount++;
        else successCount++;
      }

      setCsvResult(`Import finished: ${successCount} imported, ${errorCount} failed/skipped.`);
      setCsvText('');
    } catch (err) {
      setCsvResult('Error processing CSV');
    } finally {
      setCsvImporting(false);
    }
  }

  // Generate monthly report (Calls hr_monthly_report RPC)
  async function handleGenerateReport() {
    setLoadingReport(true);
    try {
      const { data, error } = await supabase.rpc('hr_monthly_report', {
        p_year: Number(reportYear),
        p_month: Number(reportMonth),
      });

      if (error) throw error;
      setReportData(data ?? []);
      setReportLoaded(true);
      clientLogger.info('HR Monthly Report generated', { year: reportYear, month: reportMonth, rows: data?.length });
    } catch (err) {
      clientLogger.error('Failed to generate monthly report', err instanceof Error ? err : undefined);
    } finally {
      setLoadingReport(false);
    }
  }

  // Export report to CSV
  function downloadCsv() {
    if (reportData.length === 0) return;

    // Strict CSV header without reason
    const headers = ['Employee Name', 'Email', 'Branch', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Decided At'];
    const rows = reportData.map((r) => [
      `"${r.employee_name}"`,
      `"${r.email}"`,
      `"${r.branch_name}"`,
      `"${r.leave_type}"`,
      r.start_date,
      r.end_date,
      r.days,
      r.status,
      r.decided_at ? `"${r.decided_at}"` : '""',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leave-report-${reportYear}-${String(reportMonth).padStart(2, '0')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <AppShell profile={profile} activeRoute="/admin">
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">HR Administration</h1>
            <p className="text-sm text-slate-400 mt-1">
              Company leave policies, user management, and compliance reports
            </p>
          </div>

          <Link
            href="/admin/diagnostics"
            className="btn-ghost self-start sm:self-auto flex items-center gap-2 text-xs py-2 px-3 border border-slate-700/60"
            id="admin-diagnostics-link"
          >
            <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            System Diagnostics
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 space-x-2">
          <button
            onClick={() => setActiveTab('policies')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'policies'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
            id="tab-policies"
          >
            Leave Policies
          </button>
          <button
            onClick={() => setActiveTab('invite')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'invite'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
            id="tab-invite"
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'report'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
            id="tab-report"
          >
            Monthly Reports
          </button>
        </div>

        {/* Tab 1: Policies */}
        {activeTab === 'policies' && (
          <div className="card p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">Company Leave Settings</h2>
              <p className="text-xs text-slate-400 mt-1">Configure automated rules and default schedules</p>
            </div>

            {policyMessage && (
              <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs">
                {policyMessage}
              </div>
            )}

            <form onSubmit={handleSavePolicy} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Auto-approve requests below (days)
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  D1 Rule: Applies only to Casual Leave (CL). 0 disables auto-approval.
                </p>
                <input
                  type="number"
                  min="0"
                  max="14"
                  value={policy.auto_approve_below_days}
                  onChange={(e) => setPolicy({ ...policy, auto_approve_below_days: parseInt(e.target.value) || 0 })}
                  className="input max-w-xs"
                  id="policy-auto-approve"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Weekly Off Days
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  Days excluded when calculating leave duration. Default: Saturday & Sunday.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { val: 0, label: 'Sunday' },
                    { val: 1, label: 'Monday' },
                    { val: 2, label: 'Tuesday' },
                    { val: 3, label: 'Wednesday' },
                    { val: 4, label: 'Thursday' },
                    { val: 5, label: 'Friday' },
                    { val: 6, label: 'Saturday' },
                  ].map((day) => {
                    const isChecked = policy.weekly_off_days.includes(day.val);
                    return (
                      <button
                        type="button"
                        key={day.val}
                        onClick={() => {
                          const updated = isChecked
                            ? policy.weekly_off_days.filter((d) => d !== day.val)
                            : [...policy.weekly_off_days, day.val];
                          setPolicy({ ...policy, weekly_off_days: updated });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                          isChecked
                            ? 'bg-brand-600 border-brand-500 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  disabled
                  value={policy.timezone}
                  className="input max-w-xs opacity-75"
                />
              </div>

              <button
                type="submit"
                disabled={savingPolicy}
                className="btn-primary"
                id="save-policy-btn"
              >
                {savingPolicy ? 'Saving...' : 'Save Policy Settings'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: User Invite & Bulk Import */}
        {activeTab === 'invite' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Single Invite */}
            <div className="card p-6 space-y-4">
              <h2 className="text-base font-bold text-white">Invite Single Employee</h2>
              {inviteStatus && (
                <div className={`p-3 rounded-xl text-xs ${inviteStatus.startsWith('Error') ? 'bg-red-500/10 text-red-300' : 'bg-brand-500/10 text-brand-300'}`}>
                  {inviteStatus}
                </div>
              )}
              <form onSubmit={handleInviteUser} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Anand Kumar"
                    className="input w-full"
                    id="invite-name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. anand@kestrel.com"
                    className="input w-full"
                    id="invite-email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Branch</label>
                  <select
                    value={inviteBranch}
                    onChange={(e) => setInviteBranch(e.target.value)}
                    className="input w-full"
                    id="invite-branch"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Manager</label>
                  <select
                    value={inviteManager}
                    onChange={(e) => setInviteManager(e.target.value)}
                    className="input w-full"
                    id="invite-manager"
                  >
                    <option value="">No manager (HR Admin approves)</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name} ({m.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="input w-full"
                    id="invite-role"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr_admin">HR Admin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting}
                  className="btn-primary w-full mt-2"
                  id="submit-invite-btn"
                >
                  {inviting ? 'Inviting...' : 'Add Employee'}
                </button>
              </form>
            </div>

            {/* Bulk CSV Import */}
            <div className="card p-6 space-y-4">
              <h2 className="text-base font-bold text-white">Bulk CSV Import</h2>
              <p className="text-xs text-slate-400">
                Format: <code className="text-brand-300">email, full_name, branch_code, manager_email, role</code>
              </p>
              {csvResult && (
                <div className="p-3 rounded-xl bg-slate-800 text-xs text-slate-200">
                  {csvResult}
                </div>
              )}
              <textarea
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="raj@kestrel.com, Raj Verma, MUM, manager1@kestrel.com, employee"
                className="input w-full font-mono text-xs"
                id="csv-import-textarea"
              />
              <button
                type="button"
                onClick={handleCsvImport}
                disabled={csvImporting || !csvText.trim()}
                className="btn-secondary w-full"
                id="submit-csv-btn"
              >
                {csvImporting ? 'Importing...' : 'Process CSV Import'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Monthly Reports & CSV */}
        {activeTab === 'report' && (
          <div className="card p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">Monthly Leave Audit Report</h2>
              <p className="text-xs text-slate-400 mt-1">
                Generates leave utilization and approval reports. Strictly excludes private leave reasons.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Month</label>
                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(parseInt(e.target.value))}
                  className="input text-xs"
                  id="report-month-select"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Year</label>
                <input
                  type="number"
                  min="2020"
                  max="2030"
                  value={reportYear}
                  onChange={(e) => setReportYear(parseInt(e.target.value))}
                  className="input text-xs w-24"
                  id="report-year-input"
                />
              </div>

              <button
                onClick={handleGenerateReport}
                disabled={loadingReport}
                className="btn-primary text-xs py-2 px-4"
                id="generate-report-btn"
              >
                {loadingReport ? 'Generating...' : 'Run Report'}
              </button>

              {reportLoaded && reportData.length > 0 && (
                <button
                  onClick={downloadCsv}
                  className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5 ml-auto"
                  id="download-csv-btn"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download CSV
                </button>
              )}
            </div>

            {/* Report Table */}
            {loadingReport ? (
              <div className="p-8 text-center text-slate-400">Loading report data...</div>
            ) : reportLoaded ? (
              reportData.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No leave records found for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="border-b border-slate-700 bg-slate-900/50 uppercase text-[10px] text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Employee</th>
                        <th className="py-2.5 px-3">Branch</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Period</th>
                        <th className="py-2.5 px-3">Days</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reportData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-medium text-white">{row.employee_name}</td>
                          <td className="py-2.5 px-3 text-slate-400">{row.branch_name}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-700/60 font-semibold">{row.leave_type}</span>
                          </td>
                          <td className="py-2.5 px-3">{displayDateRange(row.start_date, row.end_date)}</td>
                          <td className="py-2.5 px-3 font-semibold">{row.days}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full capitalize font-medium ${
                              row.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                              row.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                              row.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-slate-700 text-slate-300'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
