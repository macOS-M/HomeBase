'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@homebase/store';
import { formatCurrency } from '@homebase/utils';
import type { Household, Member } from '@homebase/types';

export function MembersSettingsClient({
  household,
  members,
}: {
  household: Household;
  members: Member[];
}) {
  const supabase = createClient();
  const { setHousehold } = useAuthStore();

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

    setSaving(false);
    setSuccess('Budget settings saved.');
    setHousehold({ ...household, monthly_income: Number(parsedIncome.toFixed(2)) });
  }

  return (
    <section className="p-8">
      <h1 className="text-2xl font-semibold text-[#1A1714]">Members</h1>
      <p className="text-sm text-[#6B6560] mt-1">Settings → Members: set monthly income and each member’s budget share.</p>

      <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] p-5">
        <h2 className="text-sm font-semibold text-[#1A1714] uppercase tracking-wide">Household budget setup</h2>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6560] mb-1">Monthly Income (auto)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={incomeDraft}
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm"
            />
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-lg border border-[#E2DDD6] p-3 bg-[#F8F5F0]">
              <p className="text-xs text-[#6B6560]">Allocated</p>
              <p className="text-sm font-semibold text-[#1A1714]">{formatCurrency(allocationTotal)}</p>
              <p className="text-xs mt-1 text-[#2D5F3F]">Auto-synced from member budgets</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] overflow-hidden">
        <div className="p-4 border-b border-[#EFE9E0]">
          <h3 className="text-sm font-semibold text-[#1A1714]">Member budget split</h3>
          <p className="text-xs text-[#6B6560] mt-1">Household monthly income is automatically calculated from all member budgets.</p>
        </div>

        {members.length === 0 ? (
          <p className="p-6 text-sm text-[#6B6560]">No members found.</p>
        ) : (
          <ul className="divide-y divide-[#EFE9E0]">
            {members.map((member) => (
              <li key={member.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-[#1A1714]">{member.name}</p>
                  <p className="text-xs text-[#6B6560] capitalize">{member.role}</p>
                </div>
                <div className="w-48">
                  <label className="block text-[11px] text-[#6B6560] mb-1">Monthly budget</label>
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
                    className="w-full px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-[#C84B31]">{error}</p>}
      {success && <p className="mt-3 text-sm text-[#2D5F3F]">{success}</p>}

      <button
        onClick={saveBudgetSettings}
        disabled={saving}
        className="mt-4 px-4 py-2 rounded-lg bg-[#1A1714] text-white text-sm font-medium disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save budget settings'}
      </button>
    </section>
  );
}
