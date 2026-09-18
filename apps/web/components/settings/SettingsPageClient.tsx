'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@homebase/store';
import { useDeleteHousehold } from '@homebase/api';
import { COMMON_CURRENCIES, formatCurrency } from '@homebase/utils';
import type { Household, Member } from '@homebase/types';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export function SettingsPageClient({ household, member, members }: { household: Household; member: Member; members: Member[] }) {
  const supabase = createClient();
  const { setHousehold, reset } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [splitType, setSplitType] = useState<'equal' | 'percentage'>(
    household.default_split_type === 'percentage' ? 'percentage' : 'equal'
  );
  const initialMonthlyIncome = household.monthly_income ?? 0;
  const [monthlyIncome, setMonthlyIncome] = useState(String(Number(initialMonthlyIncome.toFixed(2))));
  const [baseCurrency, setBaseCurrency] = useState(household.base_currency ?? 'USD');
  const [cycleStartDay, setCycleStartDay] = useState(String(household.budget_cycle_start_day ?? 1));
  const [contributionDrafts, setContributionDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, String(m.income_contribution ?? m.monthly_budget ?? 0)]))
  );
  const [percentageDrafts, setPercentageDrafts] = useState<Record<string, string>>(() => {
    return Object.fromEntries(
      members.map((m) => {
        const rawPct = m.expense_share_percentage ?? (members.length > 0 ? 100 / members.length : 0);
        const pct = Number.isFinite(rawPct) ? rawPct : 0;
        return [m.id, pct.toFixed(2)];
      })
    );
  });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const deleteHousehold = useDeleteHousehold(supabase, household.id);
  const canDeleteHousehold = member.role === 'admin' || household.created_by === member.user_id;

  const percentageTotal = useMemo(() => {
    return members.reduce((sum, m) => {
      const pct = Number(percentageDrafts[m.id] ?? '0');
      return sum + (Number.isFinite(pct) ? pct : 0);
    }, 0);
  }, [members, percentageDrafts]);

  const contributionTotal = useMemo(() => members.reduce((sum, m) => {
    const amount = Number(contributionDrafts[m.id] ?? '0');
    return sum + (Number.isFinite(amount) && amount >= 0 ? amount : 0);
  }, 0), [members, contributionDrafts]);

  async function saveSettings() {
    setError('');
    setSuccess('');

    const parsedIncome = Number(monthlyIncome || '0');
    const parsedCycleStartDay = Number(cycleStartDay || '0');
    if (!Number.isFinite(parsedIncome) || parsedIncome < 0) {
      setError('Planned monthly income must be 0 or greater.');
      return;
    }

    if (!Number.isInteger(parsedCycleStartDay) || parsedCycleStartDay < 1 || parsedCycleStartDay > 28) {
      setError('Budget cycle start day must be between 1 and 28.');
      return;
    }

    if (Math.abs(percentageTotal - 100) > 0.01) {
      setError(`Percentages must add up to 100%. Current total: ${percentageTotal.toFixed(2)}%`);
      return;
    }

    const hasInvalidContribution = members.some((member) => {
      const value = Number(contributionDrafts[member.id] ?? '0');
      return !Number.isFinite(value) || value < 0;
    });
    if (hasInvalidContribution) {
      setError('Every income contribution must be a non-negative number.');
      return;
    }

    if (Math.abs(contributionTotal - parsedIncome) > 0.01) {
      setError(`Income contributions must add up to ${formatCurrency(parsedIncome, baseCurrency)}.`);
      return;
    }

    setSaving(true);

    const incomeValue = Number(parsedIncome.toFixed(2));
    const { error: updateError } = await supabase.rpc('configure_financial_plan', {
      p_household_id: household.id,
      p_monthly_income: incomeValue,
      p_base_currency: baseCurrency,
      p_cycle_start_day: parsedCycleStartDay,
      p_default_split_type: splitType,
      p_members: members.map((member) => ({
        id: member.id,
        income_contribution: Number(Number(contributionDrafts[member.id] ?? '0').toFixed(2)),
        expense_share_percentage: Number(Number(percentageDrafts[member.id] ?? '0').toFixed(2)),
      })),
    });

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    const updatedMembers = members.map((member) => ({
      ...member,
      income_contribution: Number(Number(contributionDrafts[member.id] ?? '0').toFixed(2)),
      expense_share_percentage: Number(Number(percentageDrafts[member.id] ?? '0').toFixed(2)),
    }));

    queryClient.setQueryData(['members', household.id], updatedMembers);
    queryClient.invalidateQueries({ queryKey: ['members', household.id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', household.id] });
    queryClient.invalidateQueries({ queryKey: ['expenses', household.id] });
    queryClient.invalidateQueries({ queryKey: ['balances', household.id] });

    setSaving(false);
    setHousehold({
      ...household,
      default_split_type: splitType,
      monthly_income: incomeValue,
      base_currency: baseCurrency,
      budget_cycle_start_day: parsedCycleStartDay,
    });
    setSuccess('Settings saved.');
    router.refresh();
  }

  async function confirmDeleteHousehold() {
    setDeleteError('');
    if (deleteConfirmationName.trim() !== household.name) {
      setDeleteError('Enter the household name exactly as shown to continue.');
      return;
    }

    try {
      await deleteHousehold.mutateAsync(deleteConfirmationName);
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      reset();
      window.location.assign('/auth/login?household_deleted=1');
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Unable to delete the household.');
    }
  }

  return (
    <>
      <style suppressHydrationWarning>{`
        .settings-root { flex: 1; background: #0E0F11; min-height: 100vh; color: #F0EDE8; }
        .settings-topbar { background: rgba(14,15,17,0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 40; }
        .settings-title { font-family: 'Instrument Serif', serif; font-size: 18px; color: #F0EDE8; }
        .settings-subtitle { font-family: 'Geist Mono', monospace; font-size: 12px; color: #6B6560; }
        .settings-content { padding: 28px 32px; display: grid; gap: 20px; }
        .settings-panel { background: #161719; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
        .settings-head { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .settings-head-title { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #C9A84C; }
        .settings-head-sub { font-family: 'Geist Mono', monospace; font-size: 11px; color: #4A4540; }
        .settings-body { padding: 18px 20px; }
        .settings-label { display: block; font-size: 11px; color: #6B6560; margin-bottom: 6px; }
        .settings-input, .settings-select { width: 100%; background: #1f2022; color: #F0EDE8; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 9px 11px; font-size: 13px; outline: none; }
        .settings-select-wrap { width: 100%; max-width: 340px; }
        .settings-note { margin-top: 8px; font-size: 12px; color: #3D3935; }
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .settings-stat { background: rgba(123,158,201,0.08); border: 1px solid rgba(123,158,201,0.2); border-radius: 10px; padding: 11px 14px; height: 100%; }
        .settings-stat-label { font-size: 11px; color: #7B9EC9; letter-spacing: 0.3px; text-transform: uppercase; }
        .settings-stat-value { margin-top: 6px; font-family: 'Geist Mono', monospace; font-size: 18px; font-weight: 600; }
        .settings-stat-ok { color: #6BA583; }
        .settings-stat-bad { color: #E07B6A; }
        .settings-table { margin-top: 14px; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; }
        .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .settings-row:last-child { border-bottom: none; }
        .settings-member { font-size: 13px; font-weight: 500; color: #D4D0CB; }
        .settings-project { margin-top: 2px; font-size: 11px; color: #3D3935; }
        .settings-pct { width: 120px; }
        .settings-empty { text-align: center; padding: 28px 16px; font-size: 13px; color: #3D3935; }
        .settings-message { margin: 2px 2px 0; font-size: 12px; }
        .settings-error { color: #E07B6A; }
        .settings-success { color: #6BA583; }
        .settings-actions { display: flex; justify-content: flex-end; }
        .settings-btn { padding: 9px 14px; background: #C9A84C; color: #0E0F11; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
        .settings-btn:hover { background: #D4B05A; }
        .settings-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .danger-panel { border-color: rgba(224,123,106,0.32); }
        .danger-title { color: #E07B6A; }
        .danger-copy { font-size: 12px; line-height: 1.55; color: #A8A29E; max-width: 720px; }
        .danger-btn { margin-top: 14px; padding: 9px 14px; background: rgba(224,123,106,0.12); color: #E07B6A; border: 1px solid rgba(224,123,106,0.45); border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .danger-btn:hover { background: rgba(224,123,106,0.2); }
        .delete-confirm { margin-top: 16px; padding: 14px; border: 1px solid rgba(224,123,106,0.25); border-radius: 10px; background: rgba(224,123,106,0.05); max-width: 560px; }
        .delete-actions { display: flex; gap: 10px; margin-top: 12px; align-items: center; }
        .delete-cancel { padding: 8px 12px; background: transparent; color: #A8A29E; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 12px; cursor: pointer; }

        @media (max-width: 768px) {
          .settings-topbar { padding: 12px 14px; height: auto; min-height: 56px; }
          .settings-content { padding: 14px; }
          .settings-head, .settings-body, .settings-row { padding-left: 14px; padding-right: 14px; }
          .settings-grid { grid-template-columns: 1fr; }
          .settings-row { flex-direction: column; align-items: flex-start; }
          .settings-pct { width: 100%; }
          .settings-actions { justify-content: stretch; }
          .settings-btn { width: 100%; }
        }
      `}</style>

      <section className="settings-root">
        <div className="settings-topbar">
          <span className="settings-title">Settings</span>
          <span className="settings-subtitle">Plan, currency, and reimbursement rules</span>
        </div>

        <div className="settings-content">
          <div className="settings-panel">
            <div className="settings-head">
              <span className="settings-head-title">Default expense split</span>
              <span className="settings-head-sub">Applied to new expenses</span>
            </div>
            <div className="settings-body">
              <div className="settings-select-wrap">
                <label className="settings-label">Split mode</label>
                <select
                  className="settings-select"
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value as 'equal' | 'percentage')}
                >
                  <option value="equal">Equal split</option>
                  <option value="percentage">By saved expense share (percentage)</option>
                </select>
              </div>
              <p className="settings-note">Used as the pre-selected split type when logging a new expense.</p>
            </div>
          </div>

          <div className="settings-panel">
            <div className="settings-head">
              <span className="settings-head-title">Household financial plan</span>
              <span className="settings-head-sub">One plan; separate contribution and sharing rules</span>
            </div>
            <div className="settings-body">
              <div className="settings-grid">
                <div>
                  <label className="settings-label">Planned income per monthly cycle</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    className="settings-input"
                  />
                </div>
                <div>
                  <div className="settings-stat">
                    <p className="settings-stat-label">Declared contributions</p>
                    <p className={`settings-stat-value ${Math.abs(contributionTotal - Number(monthlyIncome || '0')) < 0.01 ? 'settings-stat-ok' : 'settings-stat-bad'}`}>
                      {formatCurrency(contributionTotal, baseCurrency)}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="settings-label">Household base currency</label>
                  <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} className="settings-select">
                    {COMMON_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} {currency.symbol}</option>)}
                  </select>
                </div>
                <div>
                  <label className="settings-label">Monthly cycle starts on day</label>
                  <input type="number" min="1" max="28" value={cycleStartDay} onChange={(e) => setCycleStartDay(e.target.value)} className="settings-input" />
                </div>
              </div>
              <p className="settings-note">Spending, category limits, and bills use this monthly cycle. A cycle beginning on day 15 runs through day 14 of the following month.</p>

              <div className="settings-table">
                {members.length === 0 ? (
                  <p className="settings-empty">No members found.</p>
                ) : (
                  <ul>
                    {members.map((m) => {
                      return (
                        <li key={m.id} className="settings-row">
                          <div>
                            <p className="settings-member">{m.name}</p>
                            <p className="settings-project">Contribution: {formatCurrency(Number(contributionDrafts[m.id] ?? '0'), baseCurrency)}</p>
                          </div>
                          <div className="settings-pct">
                            <label className="settings-label">Income contribution</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={contributionDrafts[m.id] ?? '0'}
                              onChange={(e) => setContributionDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                              className="settings-input"
                            />
                          </div>
                          <div className="settings-pct">
                            <label className="settings-label">Expense share %</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={percentageDrafts[m.id] ?? '0'}
                              onChange={(e) =>
                                setPercentageDrafts((prev) => ({
                                  ...prev,
                                  [m.id]: e.target.value,
                                }))
                              }
                              className="settings-input"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <p className={`settings-note ${Math.abs(percentageTotal - 100) < 0.01 ? '' : 'settings-error'}`}>
                Expense shares total {percentageTotal.toFixed(2)}%. They must total 100% before saving.
              </p>
            </div>
          </div>

          {error && <p className="settings-message settings-error">{error}</p>}
          {success && <p className="settings-message settings-success">{success}</p>}

          <div className="settings-actions">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="settings-btn"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>

          {canDeleteHousehold && (
            <div className="settings-panel danger-panel">
              <div className="settings-head">
                <span className="settings-head-title danger-title">Danger zone</span>
                <span className="settings-head-sub">Permanent action</span>
              </div>
              <div className="settings-body">
                <p className="danger-copy">
                  Delete <strong>{household.name}</strong> and all of its expenses, bills, settlements, categories, lists, and member records. This does not delete anyone&apos;s account, but it cannot be undone.
                </p>
                {!showDeleteConfirmation ? (
                  <button className="danger-btn" onClick={() => setShowDeleteConfirmation(true)}>
                    Delete household
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <label className="settings-label">Type <strong>{household.name}</strong> to confirm</label>
                    <input
                      value={deleteConfirmationName}
                      onChange={(event) => setDeleteConfirmationName(event.target.value)}
                      className="settings-input"
                      autoComplete="off"
                      disabled={deleteHousehold.isPending}
                    />
                    {deleteError && <p className="settings-message settings-error">{deleteError}</p>}
                    <div className="delete-actions">
                      <button
                        className="danger-btn"
                        onClick={confirmDeleteHousehold}
                        disabled={deleteHousehold.isPending}
                      >
                        {deleteHousehold.isPending ? 'Deleting…' : 'Permanently delete household'}
                      </button>
                      <button
                        className="delete-cancel"
                        onClick={() => {
                          setShowDeleteConfirmation(false);
                          setDeleteConfirmationName('');
                          setDeleteError('');
                        }}
                        disabled={deleteHousehold.isPending}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
