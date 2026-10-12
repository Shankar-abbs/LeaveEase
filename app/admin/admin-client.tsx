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

  // Invite & Onboarding state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteBranch, setInviteBranch] = useState(branches[0]?.id || '');
  const [inviteManager, setInviteManager] = useState('');
  const [inviteRole, setInviteRole] = useState<'employee' | 'manager' | 'hr_admin'>('employee');
  const [invitePassword, setInvitePassword] = useState('');
  const [grantQuotas, setGrantQuotas] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    tempPassword?: string;
    branch?: string;
  }>({});
  const [lastOnboarded, setLastOnboarded] = useState<{
    email: string;
    fullName: string;
    role: string;
    tempPassword: string;
  } | null>(null);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  function generateSecureTempPassword() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz!@#$%';
    const rand = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const generated = `Temp@${rand}`;
    setInvitePassword(generated);
    setFieldErrors((prev) => ({ ...prev, tempPassword: undefined }));
    return generated;
  }

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
    setPolicyMessage(null);

    if (policy.auto_approve_below_days < 0) {
      setPolicyMessage('Error: Auto-approval threshold cannot be negative');
      return;
    }
    if (!policy.weekly_off_days || policy.weekly_off_days.length === 0) {
      setPolicyMessage('Error: At least one weekly off day must be configured');
      return;
    }

    setSavingPolicy(true);

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
    } catch (err: any) {
      setPolicyMessage(`Error: ${err.message || 'Failed to save policy settings'}`);
      clientLogger.error('Failed to save policy settings', err instanceof Error ? err : undefined);
    } finally {
      setSavingPolicy(false);
    }
  }

  // Client-side form validation before API dispatch
  function validateOnboardForm(): boolean {
    const errors: typeof fieldErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!inviteName.trim()) {
      errors.fullName = 'Please enter employee full name';
    } else if (inviteName.trim().length < 2) {
      errors.fullName = 'Full name must be at least 2 characters';
    }

    if (!inviteEmail.trim()) {
      errors.email = 'Please enter work email address';
    } else if (!emailRegex.test(inviteEmail.trim())) {
      errors.email = 'Please enter a valid work email address (e.g. employee@kestrel.com)';
    }

    if (invitePassword.trim() && invitePassword.trim().length < 8) {
      errors.tempPassword = 'Temporary password must be at least 8 characters';
    }

    if (!inviteBranch) {
      errors.branch = 'Please select a company branch';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Invite & Onboard user via production API
  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviteStatus(null);
    setLastOnboarded(null);

    // Validate client-side first
    if (!validateOnboardForm()) {
      return;
    }

    setInviting(true);
    const tempPwd = invitePassword.trim() || generateSecureTempPassword();

    try {
      const res = await fetch('/api/admin/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: inviteName.trim(),
          email: inviteEmail.trim().toLowerCase(),
          branchId: inviteBranch,
          managerId: inviteManager || null,
          role: inviteRole,
          tempPassword: tempPwd,
          grantQuotas,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        let errorMsg = data.error || 'Failed to onboard employee';

        // Map server validation details directly to field errors if returned
        if (data.details) {
          const newErrors: typeof fieldErrors = {};
          if (data.details.fullName?.[0]) newErrors.fullName = data.details.fullName[0];
          if (data.details.email?.[0]) newErrors.email = data.details.email[0];
          if (data.details.tempPassword?.[0]) newErrors.tempPassword = data.details.tempPassword[0];
          if (data.details.branchId?.[0]) newErrors.branch = data.details.branchId[0];
          setFieldErrors(newErrors);

          const detailMessages = Object.values(data.details).flat().filter(Boolean);
          if (detailMessages.length > 0) {
            errorMsg = detailMessages.join('. ');
          }
        }
        throw new Error(errorMsg);
      }

      setLastOnboarded({
        email: inviteEmail.trim().toLowerCase(),
        fullName: inviteName.trim(),
        role: inviteRole,
        tempPassword: tempPwd,
      });

      setInviteStatus(`Success: Onboarded ${inviteName} (${inviteEmail})`);
      setInviteEmail('');
      setInviteName('');
      setInvitePassword('');
      setFieldErrors({});
    } catch (err: any) {
      setInviteStatus(`Error: ${err.message || 'Failed to onboard user'}`);
    } finally {
      setInviting(false);
    }
  }

  // Bulk CSV Import via production API
  async function handleCsvImport() {
    if (!csvText.trim()) {
      setCsvResult('Error: Please enter CSV text containing employee rows before processing.');
      return;
    }
    setCsvImporting(true);
    setCsvResult(null);

    try {
      const res = await fetch('/api/admin/onboard-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process bulk import');
      }

      const failedDetails = Array.isArray(data.results)
        ? data.results
            .filter((r: any) => r.status === 'error')
            .map((r: any) => `${r.email || r.name}: ${r.message || 'Failed'}`)
            .slice(0, 5)
        : [];

      let summary = `Bulk import complete: ${data.succeeded} onboarded successfully, ${data.failed} failed/skipped out of ${data.total} rows.`;
      if (failedDetails.length > 0) {
        summary += `\nIssues:\n• ${failedDetails.join('\n• ')}`;
      }

      setCsvResult(summary);
      if (data.failed === 0) {
        setCsvText('');
      }
    } catch (err: any) {
      setCsvResult(`Error: ${err.message || 'Error processing CSV'}`);
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
            {/* Single Onboarding */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">Onboard Single Employee</h2>
                  <p className="text-xs text-slate-400">Provisions authentication, profile, and initial leave ledger quotas.</p>
                </div>
              </div>

              {inviteStatus && (
                <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${inviteStatus.startsWith('Error') ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'}`}>
                  <span>{inviteStatus}</span>
                </div>
              )}

              {/* Onboarded Credentials Card */}
              {lastOnboarded && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-brand-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                      Provisioned Credentials Ready to Send
                    </span>
                    {copiedNotification && (
                      <span className="text-[11px] text-emerald-400 font-medium">{copiedNotification}</span>
                    )}
                  </div>

                  <div className="bg-slate-900/90 rounded-lg p-3 text-xs font-mono space-y-1.5 border border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Name:</span>
                      <span className="text-white font-medium">{lastOnboarded.fullName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Email:</span>
                      <span className="text-white font-medium">{lastOnboarded.email}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Temp Password:</span>
                      <span className="text-brand-300 font-bold bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                        {lastOnboarded.tempPassword}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(lastOnboarded.tempPassword);
                        setCopiedNotification('Password copied!');
                        setTimeout(() => setCopiedNotification(null), 3000);
                      }}
                      className="btn-secondary text-[11px] py-1.5 flex-1"
                      id="copy-password-btn"
                    >
                      Copy Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                        const msg = `Hi ${lastOnboarded.fullName},\n\nWelcome to Kestrel Logistics! Your LeaveEase account has been set up.\n\nLogin URL: ${origin}/login\nEmail: ${lastOnboarded.email}\nTemporary Password: ${lastOnboarded.tempPassword}\n\nPlease log in and update your password immediately under Account Settings.\n\nRegards,\nHuman Resources`;
                        navigator.clipboard.writeText(msg);
                        setCopiedNotification('Welcome instructions copied!');
                        setTimeout(() => setCopiedNotification(null), 3000);
                      }}
                      className="btn-primary text-[11px] py-1.5 flex-1"
                      id="copy-welcome-msg-btn"
                    >
                      Copy Welcome Instructions
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleInviteUser} className="space-y-3.5" noValidate>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="invite-name">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => {
                      setInviteName(e.target.value);
                      if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                    }}
                    placeholder="e.g. Anand Kumar"
                    className={`input w-full ${fieldErrors.fullName ? 'border-red-500/60 focus:border-red-500 bg-red-500/5' : ''}`}
                    id="invite-name"
                  />
                  {fieldErrors.fullName && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <span>•</span> {fieldErrors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="invite-email">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="e.g. anand@kestrel.com"
                    className={`input w-full ${fieldErrors.email ? 'border-red-500/60 focus:border-red-500 bg-red-500/5' : ''}`}
                    id="invite-email"
                  />
                  {fieldErrors.email && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <span>•</span> {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300" htmlFor="invite-temp-password">
                      Temporary Password
                    </label>
                    <button
                      type="button"
                      onClick={generateSecureTempPassword}
                      className="text-[11px] text-brand-400 hover:text-brand-300 underline"
                      id="generate-temp-password-btn"
                    >
                      Generate Strong Temp Password
                    </button>
                  </div>
                  <input
                    type="text"
                    value={invitePassword}
                    onChange={(e) => {
                      setInvitePassword(e.target.value);
                      if (fieldErrors.tempPassword) setFieldErrors((prev) => ({ ...prev, tempPassword: undefined }));
                    }}
                    placeholder="Auto-generated if left blank (min 8 chars)"
                    className={`input w-full font-mono text-xs ${
                      fieldErrors.tempPassword || (invitePassword.length > 0 && invitePassword.length < 8)
                        ? 'border-red-500/60 focus:border-red-500 bg-red-500/5'
                        : ''
                    }`}
                    id="invite-temp-password"
                  />
                  {/* Dynamic password helper & validation state */}
                  {fieldErrors.tempPassword ? (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <span>•</span> {fieldErrors.tempPassword}
                    </p>
                  ) : invitePassword.length > 0 ? (
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      {invitePassword.length < 8 ? (
                        <span className="text-red-400 font-medium">
                          Must be at least 8 characters ({invitePassword.length}/8 chars)
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-medium">
                          ✓ Valid password length ({invitePassword.length} characters)
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Leave blank to automatically generate a secure 11-character password.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="invite-branch">
                    Branch <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={inviteBranch}
                    onChange={(e) => {
                      setInviteBranch(e.target.value);
                      if (fieldErrors.branch) setFieldErrors((prev) => ({ ...prev, branch: undefined }));
                    }}
                    className={`input w-full ${fieldErrors.branch ? 'border-red-500/60 focus:border-red-500 bg-red-500/5' : ''}`}
                    id="invite-branch"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                  {fieldErrors.branch && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <span>•</span> {fieldErrors.branch}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="invite-manager">Manager</label>
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
                  <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="invite-role">Role</label>
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

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="grant-quotas-checkbox"
                    checked={grantQuotas}
                    onChange={(e) => setGrantQuotas(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
                  />
                  <label htmlFor="grant-quotas-checkbox" className="text-xs text-slate-300">
                    Grant initial leave quotas (12 CL, 10 SL, 15 EL)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={inviting}
                  className="btn-primary w-full mt-2"
                  id="submit-invite-btn"
                >
                  {inviting ? 'Onboarding Employee...' : 'Onboard Employee'}
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
                <div
                  className={`p-3 rounded-xl text-xs whitespace-pre-line ${
                    csvResult.startsWith('Error')
                      ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                      : 'bg-slate-800 border border-slate-700 text-slate-200'
                  }`}
                >
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
