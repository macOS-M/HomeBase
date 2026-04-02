'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@homebase/store';
import { formatCurrency } from '@homebase/utils';
import type { Household, Member } from '@homebase/types';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export function SettingsPageClient({ household, members }: { household: Household; members: Member[] }) {
  const supabase = createClient();
  const { setHousehold } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [splitType, setSplitType] = useState<'equal' | 'percentage'>(
    household.default_split_type === 'percentage' ? 'percentage' : 'equal'
  );
  const initialTotalBudget =
    household.monthly_income ?? members.reduce((sum, m) => sum + (m.monthly_budget ?? 0), 0);
  const [totalBudget, setTotalBudget] = useState(String(Number(initialTotalBudget.toFixed(2))));
  const [percentageDrafts, setPercentageDrafts] = useState<Record<string, string>>(() => {
    const base = initialTotalBudget > 0 ? initialTotalBudget : members.length > 0 ? members.length : 1;
    return Object.fromEntries(
      members.map((m) => {
        const rawPct = initialTotalBudget > 0
          ? ((m.monthly_budget ?? 0) / initialTotalBudget) * 100
          : 100 / members.length;
        const pct = Number.isFinite(rawPct) ? rawPct : 0;
        return [m.id, pct.toFixed(2)];
      })
    );
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const percentageTotal = useMemo(() => {
    return members.reduce((sum, m) => {
      const pct = Number(percentageDrafts[m.id] ?? '0');
      return sum + (Number.isFinite(pct) ? pct : 0);
    }, 0);
  }, [members, percentageDrafts]);

  const projectedBudgets = useMemo(() => {
    const parsedBudget = Number(totalBudget || '0');
    const safeBudget = Number.isFinite(parsedBudget) && parsedBudget >= 0 ? parsedBudget : 0;
    return members.map((m) => {
      const pct = Number(percentageDrafts[m.id] ?? '0');
      const safePct = Number.isFinite(pct) && pct >= 0 ? pct : 0;
      return {
        id: m.id,
        amount: Number(((safeBudget * safePct) / 100).toFixed(2)),
      };
    });
  }, [members, percentageDrafts, totalBudget]);

  async function saveSettings() {
    setError('');
    setSuccess('');

    const parsedBudget = Number(totalBudget || '0');
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setError('Total monthly budget must be 0 or greater.');
      return;
    }

    if (Math.abs(percentageTotal - 100) > 0.01) {
      setError(`Percentages must add up to 100%. Current total: ${percentageTotal.toFixed(2)}%`);
      return;
    }

    setSaving(true);

    const budgetValue = Number(parsedBudget.toFixed(2));
    const { error: updateError } = await supabase
      .from('households')
      .update({
        default_split_type: splitType,
        monthly_income: budgetValue,
      })
      .eq('id', household.id);

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    for (const budget of projectedBudgets) {
      const { error: memberError } = await supabase
        .from('members')
        .update({ monthly_budget: budget.amount })
        .eq('id', budget.id)
        .eq('household_id', household.id);

      if (memberError) {
        setSaving(false);
        setError(memberError.message);
        return;
      }
    }

    const updatedMembers = members.map((member) => ({
      ...member,
      monthly_budget: projectedBudgets.find((budget) => budget.id === member.id)?.amount ?? 0,
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
      monthly_income: budgetValue,
    });
    setSuccess('Settings saved.');
    router.refresh();
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
          <span className="settings-subtitle">Split behavior and budget rules</span>
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
                  <option value="percentage">By member budget share (percentage)</option>
                </select>
              </div>
              <p className="settings-note">Used as the pre-selected split type when logging a new expense.</p>
            </div>
          </div>

          <div className="settings-panel">
            <div className="settings-head">
              <span className="settings-head-title">Budget shares</span>
              <span className="settings-head-sub">Percentage-based distribution</span>
            </div>
            <div className="settings-body">
              <div className="settings-grid">
                <div>
                  <label className="settings-label">Total monthly budget</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalBudget}
                    onChange={(e) => setTotalBudget(e.target.value)}
                    className="settings-input"
                  />
                </div>
                <div>
                  <div className="settings-stat">
                    <p className="settings-stat-label">Percentage total</p>
                    <p className={`settings-stat-value ${Math.abs(percentageTotal - 100) < 0.01 ? 'settings-stat-ok' : 'settings-stat-bad'}`}>
                      {percentageTotal.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="settings-table">
                {members.length === 0 ? (
                  <p className="settings-empty">No members found.</p>
                ) : (
                  <ul>
                    {members.map((m) => {
                      const projected = projectedBudgets.find((b) => b.id === m.id)?.amount ?? 0;
                      return (
                        <li key={m.id} className="settings-row">
                          <div>
                            <p className="settings-member">{m.name}</p>
                            <p className="settings-project">Projected budget: {formatCurrency(projected)}</p>
                          </div>
                          <div className="settings-pct">
                            <label className="settings-label">Percent %</label>
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
        </div>
      </section>
    </>
  );
}
