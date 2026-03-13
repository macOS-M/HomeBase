'use client';

import { createClient } from '@/lib/supabase/client';
import { useBalances, useMembers, useSettleBalance } from '@homebase/api';
import { useUIStore } from '@homebase/store';
import { formatCurrency } from '@homebase/utils';
import type { Household } from '@homebase/types';

export function BalancesPageClient({ household }: { household: Household }) {
  const supabase = createClient();
  const { selectedMonth } = useUIStore();
  const { data: balances = [] } = useBalances(supabase, household.id, selectedMonth);
  const { data: members = [] } = useMembers(supabase, household.id);
  const settleBalance = useSettleBalance(supabase, household.id);

  return (
    <section className="p-8">
      <h1 className="text-2xl font-semibold text-[#1A1714]">Balances</h1>
      <p className="text-sm text-[#6B6560] mt-1">Who owes what this month</p>

      <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] overflow-hidden">
        {balances.length === 0 ? (
          <p className="p-6 text-sm text-[#6B6560]">Everyone is settled up.</p>
        ) : (
          <ul className="divide-y divide-[#EFE9E0]">
            {balances.map((balance, index) => {
              const fromMember = members.find((m) => m.id === balance.from_member_id);
              const toMember = members.find((m) => m.id === balance.to_member_id);
              return (
                <li key={`${balance.from_member_id}-${balance.to_member_id}-${index}`} className="p-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-[#1A1714]">{fromMember?.name ?? 'Unknown'} → {toMember?.name ?? 'Unknown'}</p>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-[#1A1714]">{formatCurrency(balance.amount)}</p>
                    <button
                      className="px-3 py-1.5 rounded-lg border border-[#E2DDD6] text-xs"
                      onClick={() => settleBalance.mutate({
                        fromMemberId: balance.from_member_id,
                        toMemberId: balance.to_member_id,
                        amount: balance.amount,
                      })}
                    >
                      Settle
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
