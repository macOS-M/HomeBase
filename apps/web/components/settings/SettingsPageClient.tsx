'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@homebase/store';
import { formatCurrency } from '@homebase/utils';
import type { Household, Member } from '@homebase/types';

export function SettingsPageClient({ household, members }: { household: Household; members: Member[] }) {
  const supabase = createClient();
  const { setHousehold } = useAuthStore();

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

    setSaving(false);

    setHousehold({
      ...household,
      default_split_type: splitType,
      monthly_income: budgetValue,
    });
    setSuccess('Settings saved.');
  }

  return (
    <section className="p-8">
      <h1 className="text-2xl font-semibold text-[#1A1714]">Settings</h1>
      <p className="text-sm text-[#6B6560] mt-1">Control default split behavior and settlement sensitivity.</p>

      <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-[#1A1714] uppercase tracking-wide">Default expense split</h2>
          <p className="text-xs text-[#6B6560] mt-1">Used as default when creating new expenses.</p>
          <select
            className="mt-3 w-full md:w-80 px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm bg-[#1f2022] text-[#F0EDE8]"
            value={splitType}
            onChange={(e) => setSplitType(e.target.value as 'equal' | 'percentage')}
          >
            <option value="equal">Equal split</option>
            <option value="percentage">By member budget share (percentage)</option>
          </select>
        </div>

      </div>

      <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] p-5">
        <h2 className="text-sm font-semibold text-[#1A1714] uppercase tracking-wide">Budget shares</h2>
        <p className="text-xs text-[#6B6560] mt-1">Set member percentages used for split-by-percentage mode.</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6560] mb-1">Total monthly budget</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm"
            />
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-lg border border-[#E2DDD6] p-3 bg-[#F8F5F0]">
              <p className="text-xs text-[#6B6560]">Percentage total</p>
              <p className={`text-sm font-semibold ${Math.abs(percentageTotal - 100) < 0.01 ? 'text-[#2D5F3F]' : 'text-[#C84B31]'}`}>
                {percentageTotal.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#EFE9E0]">
          {members.length === 0 ? (
            <p className="p-4 text-sm text-[#6B6560]">No members found.</p>
          ) : (
            <ul className="divide-y divide-[#EFE9E0]">
              {members.map((m) => {
                const projected = projectedBudgets.find((b) => b.id === m.id)?.amount ?? 0;
                return (
                  <li key={m.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-[#1A1714]">{m.name}</p>
                      <p className="text-xs text-[#6B6560]">Projected budget: {formatCurrency(projected)}</p>
                    </div>
                    <div className="w-32">
                      <label className="block text-[11px] text-[#6B6560] mb-1">Percent %</label>
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
                        className="w-full px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-[#C84B31]">{error}</p>}
      {success && <p className="mt-3 text-sm text-[#2D5F3F]">{success}</p>}

      <button
        onClick={saveSettings}
        disabled={saving}
        className="mt-4 px-4 py-2 rounded-lg bg-[#1A1714] text-white text-sm font-medium disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </section>
  );
}
