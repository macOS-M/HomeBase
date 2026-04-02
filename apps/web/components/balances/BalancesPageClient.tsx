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
    <>
      <style suppressHydrationWarning>{`
        .bal-root { flex: 1; background: #0E0F11; min-height: 100vh; color: #F0EDE8; }
        .bal-topbar { background: rgba(14,15,17,0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 40; }
        .bal-title { font-family: 'Instrument Serif', serif; font-size: 18px; color: #F0EDE8; }
        .bal-subtitle { font-family: 'Geist Mono', monospace; font-size: 12px; color: #6B6560; }
        .bal-content { padding: 28px 32px; }
        .bal-panel { background: #161719; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
        .bal-panel-head { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .bal-panel-title { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #C9A84C; }
        .bal-panel-count { font-family: 'Geist Mono', monospace; font-size: 11px; color: #4A4540; }
        .bal-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .bal-row:last-child { border-bottom: none; }
        .bal-main { min-width: 0; }
        .bal-name { font-size: 13px; font-weight: 500; color: #D4D0CB; }
        .bal-meta { margin-top: 2px; font-size: 11px; color: #3D3935; }
        .bal-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .bal-amount { font-family: 'Geist Mono', monospace; font-size: 14px; font-weight: 600; color: #E07B6A; }
        .bal-btn { font-size: 11px; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(201,168,76,0.25); background: rgba(201,168,76,0.08); color: #C9A84C; cursor: pointer; font-weight: 500; }
        .bal-btn:hover { background: rgba(201,168,76,0.15); }
        .bal-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .bal-empty { text-align: center; padding: 28px 16px; font-size: 13px; color: #3D3935; }

        @media (max-width: 768px) {
          .bal-topbar { padding: 12px 14px; height: auto; min-height: 56px; }
          .bal-content { padding: 14px; }
          .bal-row, .bal-panel-head { padding-left: 14px; padding-right: 14px; }
        }
      `}</style>

      <section className="bal-root">
        <div className="bal-topbar">
          <span className="bal-title">Balances</span>
          <span className="bal-subtitle">Who owes what this month</span>
        </div>

        <div className="bal-content">
          <div className="bal-panel">
            <div className="bal-panel-head">
              <span className="bal-panel-title">Outstanding balances</span>
              <span className="bal-panel-count">{selectedMonth}</span>
            </div>

            {balances.length === 0 ? (
              <p className="bal-empty">Everyone is settled up 🎉</p>
            ) : (
              <ul>
                {balances.map((balance, index) => {
                  const fromMember = members.find((m) => m.id === balance.from_member_id);
                  const toMember = members.find((m) => m.id === balance.to_member_id);
                  return (
                    <li key={`${balance.from_member_id}-${balance.to_member_id}-${index}`} className="bal-row">
                      <div className="bal-main">
                        <p className="bal-name">{fromMember?.name ?? 'Unknown'} → {toMember?.name ?? 'Unknown'}</p>
                        <p className="bal-meta">Unsettled between members</p>
                      </div>

                      <div className="bal-right">
                        <p className="bal-amount">{formatCurrency(balance.amount)}</p>
                        <button
                          className="bal-btn"
                          disabled={settleBalance.isPending}
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
        </div>
      </section>
    </>
  );
}
