'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@homebase/store';
import { formatCurrency } from '@homebase/utils';
import type { Household, Member } from '@homebase/types';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export function MembersSettingsClient({
  household,
  members,
}: {
  household: Household;
  members: Member[];
}) {
  const supabase = createClient();
  const { setHousehold } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [incomeDraft, setIncomeDraft] = useState((household.monthly_income ?? 0).toString());
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>(
    Object.fromEntries(members.map((member) => [member.id, String(member.monthly_budget ?? 0)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const allocationTotal = useMemo(() => {
    return members.reduce((sum, member) => {
      const value = Number(memberDrafts[member.id] || '0');
      return sum + (Number.isFinite(value) && value >= 0 ? value : 0);
    }, 0);
  }, [members, memberDrafts]);

  useEffect(() => {
    setIncomeDraft(allocationTotal.toFixed(2));
  }, [allocationTotal]);

  async function saveBudgetSettings() {
    setError('');
    setSuccess('');

    const parsedIncome = Number(allocationTotal.toFixed(2));

    const updates = members.map((member) => {
      const raw = memberDrafts[member.id] ?? '0';
      const parsed = Number(raw || '0');
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid budget value for ${member.name}.`);
      }
      return {
        id: member.id,
        monthly_budget: Number(parsed.toFixed(2)),
      };
    });

    setSaving(true);

    const { error: householdError } = await supabase
      .from('households')
      .update({ monthly_income: Number(parsedIncome.toFixed(2)) })
      .eq('id', household.id);

    if (householdError) {
      setSaving(false);
      setError(householdError.message);
      return;
    }

    for (const update of updates) {
      const { error: memberError } = await supabase
        .from('members')
        .update({ monthly_budget: update.monthly_budget })
        .eq('id', update.id)
        .eq('household_id', household.id);

      if (memberError) {
        setSaving(false);
        setError(memberError.message);
        return;
      }
    }

    const nextIncome = Number(parsedIncome.toFixed(2));
    const updatedMembers = members.map((member) => ({
      ...member,
      monthly_budget: Number(Number(memberDrafts[member.id] ?? '0').toFixed(2)),
    }));

    queryClient.setQueryData(['members', household.id], updatedMembers);
    queryClient.invalidateQueries({ queryKey: ['members', household.id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', household.id] });
    queryClient.invalidateQueries({ queryKey: ['expenses', household.id] });
    queryClient.invalidateQueries({ queryKey: ['balances', household.id] });

    setSaving(false);
    setSuccess('Budget settings saved.');
    setHousehold({ ...household, monthly_income: nextIncome });
    router.refresh();
  }

  return (
    <>
      <style suppressHydrationWarning>{`
        .members-root { flex: 1; background: #0E0F11; min-height: 100vh; color: #F0EDE8; }
        .members-topbar { background: rgba(14,15,17,0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 40; }
        .members-title { font-family: 'Instrument Serif', serif; font-size: 18px; color: #F0EDE8; }
        .members-subtitle { font-family: 'Geist Mono', monospace; font-size: 12px; color: #6B6560; }
        .members-content { padding: 28px 32px; display: grid; gap: 20px; }
        .members-panel { background: #161719; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
        .members-head { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .members-head-title { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #C9A84C; }
        .members-head-sub { font-family: 'Geist Mono', monospace; font-size: 11px; color: #4A4540; }
        .members-panel-body { padding: 18px 20px; }
        .members-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .members-label { display: block; font-size: 11px; color: #6B6560; margin-bottom: 6px; }
        .members-input { width: 100%; background: #1f2022; color: #F0EDE8; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 9px 11px; font-size: 13px; outline: none; }
        .members-stat { background: rgba(107,165,131,0.08); border: 1px solid rgba(107,165,131,0.2); border-radius: 10px; padding: 11px 14px; height: 100%; }
        .members-stat-label { font-size: 11px; color: #6BA583; letter-spacing: 0.3px; text-transform: uppercase; }
        .members-stat-value { margin-top: 6px; font-family: 'Geist Mono', monospace; font-size: 18px; font-weight: 600; color: #6BA583; }
        .members-stat-sub { margin-top: 4px; font-size: 11px; color: #4A4540; }
        .members-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .members-row:last-child { border-bottom: none; }
        .members-name { font-size: 13px; font-weight: 500; color: #D4D0CB; }
        .members-role { margin-top: 2px; font-size: 11px; color: #3D3935; text-transform: capitalize; }
        .members-budget { width: 180px; }
        .members-message { margin: 2px 2px 0; font-size: 12px; }
        .members-message-error { color: #E07B6A; }
        .members-message-ok { color: #6BA583; }
        .members-empty { text-align: center; padding: 28px 16px; font-size: 13px; color: #3D3935; }
        .members-actions { display: flex; justify-content: flex-end; }
        .members-btn { padding: 9px 14px; background: #C9A84C; color: #0E0F11; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
        .members-btn:hover { background: #D4B05A; }
        .members-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        @media (max-width: 768px) {
          .members-topbar { padding: 12px 14px; height: auto; min-height: 56px; }
          .members-content { padding: 14px; }
          .members-grid { grid-template-columns: 1fr; }
          .members-head, .members-panel-body, .members-row { padding-left: 14px; padding-right: 14px; }
          .members-row { flex-direction: column; align-items: flex-start; }
          .members-budget { width: 100%; }
          .members-actions { justify-content: stretch; }
          .members-btn { width: 100%; }
        }
      `}</style>

      <section className="members-root">
        <div className="members-topbar">
          <span className="members-title">Members</span>
          <span className="members-subtitle">Budget split management</span>
        </div>

        <div className="members-content">
          <div className="members-panel">
            <div className="members-head">
              <span className="members-head-title">Household budget setup</span>
              <span className="members-head-sub">Auto-synced from member budgets</span>
            </div>

            <div className="members-panel-body">
              <div className="members-grid">
                <div>
                  <label className="members-label">Monthly Income (auto)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={incomeDraft}
                    readOnly
                    className="members-input"
                  />
                </div>
                <div>
                  <div className="members-stat">
                    <p className="members-stat-label">Allocated</p>
                    <p className="members-stat-value">{formatCurrency(allocationTotal)}</p>
                    <p className="members-stat-sub">Derived from all member budget values</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="members-panel">
            <div className="members-head">
              <span className="members-head-title">Member budget split</span>
              <span className="members-head-sub">{members.length} member{members.length !== 1 ? 's' : ''}</span>
            </div>

            {members.length === 0 ? (
              <p className="members-empty">No members found.</p>
            ) : (
              <ul>
                {members.map((member) => (
                  <li key={member.id} className="members-row">
                    <div>
                      <p className="members-name">{member.name}</p>
                      <p className="members-role">{member.role}</p>
                    </div>
                    <div className="members-budget">
                      <label className="members-label">Monthly budget</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={memberDrafts[member.id] ?? '0'}
                        onChange={(e) =>
                          setMemberDrafts((prev) => ({
                            ...prev,
                            [member.id]: e.target.value,
                          }))
                        }
                        className="members-input"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="members-message members-message-error">{error}</p>}
          {success && <p className="members-message members-message-ok">{success}</p>}

          <div className="members-actions">
            <button
              onClick={saveBudgetSettings}
              disabled={saving}
              className="members-btn"
            >
              {saving ? 'Saving…' : 'Save budget settings'}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
