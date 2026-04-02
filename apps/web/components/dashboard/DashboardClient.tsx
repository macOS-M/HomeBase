'use client';

import { createClient } from '@/lib/supabase/client';
import { useExpenses, useBills, useBalances, useWallet, useCategories, useMembers } from '@homebase/api';
import { useUIStore, useAuthStore } from '@homebase/store';
import { formatCurrency, getBudgetStatus, calculateSmartSettlements } from '@homebase/utils';
import type { Member, Household } from '@homebase/types';
import { useEffect } from 'react';
import Link from 'next/link';

interface Props {
  member: Member;
  household: Household;
}

export function DashboardClient({ member, household }: Props) {
  const supabase = createClient();
  const { selectedMonth } = useUIStore();
  const { setMember, setHousehold } = useAuthStore();

  useEffect(() => {
    setMember(member);
    setHousehold(household);
  }, [member, household]);

  const { data: expenses = [] } = useExpenses(supabase, household.id, selectedMonth);
  const { data: bills = [] } = useBills(supabase, household.id);
  const { data: balances = [] } = useBalances(supabase, household.id, selectedMonth);
  const { data: wallet } = useWallet(supabase, household.id);
  const { data: categories = [] } = useCategories(supabase, household.id);
  const { data: members = [] } = useMembers(supabase, household.id);

  const billsForSelectedMonth = bills.filter((bill) => bill.due_date?.startsWith(selectedMonth));
  const paidBillsForSelectedMonth = billsForSelectedMonth.filter((bill) => bill.status === 'paid');
  const pendingBills = billsForSelectedMonth.filter(
    (bill) => bill.status === 'pending' || bill.status === 'overdue'
  );

  const expenseSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalSpent = expenseSpent;
  const memberBudgetTotal = members.reduce((sum, m) => sum + (m.monthly_budget ?? 0), 0);
  const monthlyIncome = household.monthly_income ?? memberBudgetTotal;
  const remaining = monthlyIncome - totalSpent;
  const spentPct = monthlyIncome > 0 ? (totalSpent / monthlyIncome) * 100 : 0;
  const pendingTotal = pendingBills.reduce((sum, bill) => sum + bill.amount, 0);
  const groceryCat = categories.find(c => c.is_grocery);
  const grocerySpent = expenses
    .filter(e => e.category_id === groceryCat?.id)
    .reduce((s, e) => s + e.amount, 0);
  const settlements = calculateSmartSettlements(balances);

  return (
    <>
      <style suppressHydrationWarning>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
        .dash-root { flex:1; background:#0E0F11; min-height:100vh; font-family:'Geist',sans-serif; color:#F0EDE8; }
        .dash-topbar { background:rgba(14,15,17,0.85); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); padding:0 32px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:50; }
        .dash-topbar-title { font-family:'Instrument Serif',serif; font-size:18px; color:#F0EDE8; }
        .dash-topbar-right { display:flex; align-items:center; gap:10px; }
        .month-select { background:#1f2022; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:6px 12px; font-family:'Geist',sans-serif; font-size:13px; color:#F0EDE8; cursor:pointer; outline:none; }
        .month-select option { background:#1f2022; color:#F0EDE8; }
        .topbar-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; background:#C9A84C; color:#0E0F11; border-radius:8px; font-family:'Geist',sans-serif; font-size:13px; font-weight:600; text-decoration:none; border:none; cursor:pointer; }
        .topbar-btn:hover { background:#D4B05A; }
        .wallet-pill { display:inline-flex; align-items:center; gap:6px; background:rgba(201,168,76,0.08); border:1px solid rgba(201,168,76,0.2); border-radius:20px; padding:4px 12px; font-size:12px; color:#C9A84C; font-family:'Geist Mono',monospace; font-weight:500; }
        .dash-content { padding:28px 32px; }
        .summary-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:rgba(255,255,255,0.06); border-radius:16px; overflow:hidden; margin-bottom:28px; border:1px solid rgba(255,255,255,0.06); }
        .summary-cell { background:#161719; padding:22px 24px; position:relative; transition:background 0.2s; }
        .summary-cell:hover { background:#1A1B1E; }
        .summary-cell-label { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#4A4540; margin-bottom:8px; }
        .summary-cell-value { font-family:'Instrument Serif',serif; font-size:30px; color:#F0EDE8; letter-spacing:-0.5px; line-height:1; }
        .summary-cell-sub { font-size:11px; color:#3D3935; margin-top:6px; font-family:'Geist Mono',monospace; }
        .summary-accent-line { position:absolute; bottom:0; left:0; right:0; height:2px; }
        .summary-progress-track { margin-top:10px; height:2px; background:rgba(255,255,255,0.06); border-radius:1px; overflow:hidden; }
        .summary-progress-fill { height:100%; border-radius:1px; }
        .dash-grid { display:grid; grid-template-columns:1fr 340px; gap:20px; }
        .dash-left { display:flex; flex-direction:column; gap:20px; }
        .dash-right { display:flex; flex-direction:column; gap:20px; }
        .panel { background:#161719; border:1px solid rgba(255,255,255,0.06); border-radius:16px; overflow:hidden; }
        .panel-header { padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:space-between; }
        .panel-title { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#C9A84C; }
        .panel-link { font-size:12px; color:#3D3935; text-decoration:none; font-weight:500; }
        .panel-link:hover { color:#C9A84C; }
        .panel-body { padding:18px 20px; }
        .cat-row { margin-bottom:16px; }
        .cat-row:last-child { margin-bottom:0; }
        .cat-row-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
        .cat-name { font-size:13px; font-weight:500; color:#C8C4BF; display:flex; align-items:center; gap:8px; }
        .cat-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .cat-amounts { font-family:'Geist Mono',monospace; font-size:12px; color:#4A4540; }
        .cat-amounts strong { color:#A8A29E; font-weight:500; }
        .cat-track { height:3px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; }
        .cat-fill { height:100%; border-radius:2px; }
        .exp-row { display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s; }
        .exp-row:last-child { border-bottom:none; }
        .exp-row:hover { background:rgba(255,255,255,0.02); }
        .exp-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
        .exp-info { flex:1; min-width:0; }
        .exp-name { font-size:13px; font-weight:500; color:#D4D0CB; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .exp-meta { font-size:11px; color:#3D3935; margin-top:2px; }
        .exp-amount { font-family:'Geist Mono',monospace; font-size:14px; font-weight:500; color:#A8A29E; flex-shrink:0; }
        .bal-row { display:flex; align-items:center; gap:10px; padding:11px 20px; border-bottom:1px solid rgba(255,255,255,0.04); }
        .bal-row:last-child { border-bottom:none; }
        .bal-info { flex:1; }
        .bal-name { font-size:13px; font-weight:500; color:#C8C4BF; }
        .bal-sub { font-size:11px; color:#3D3935; margin-top:1px; }
        .bal-amount { font-family:'Geist Mono',monospace; font-size:14px; font-weight:600; color:#E07B6A; }
        .bal-settle { font-size:11px; padding:4px 10px; border-radius:6px; border:1px solid rgba(201,168,76,0.25); background:rgba(201,168,76,0.07); color:#C9A84C; cursor:pointer; font-family:'Geist',sans-serif; font-weight:500; }
        .bal-settle:hover { background:rgba(201,168,76,0.15); }
        .settlement-callout { margin:12px 20px 16px; background:rgba(201,168,76,0.06); border:1px solid rgba(201,168,76,0.15); border-radius:10px; padding:12px 14px; }
        .settlement-callout-title { font-size:11px; font-weight:600; color:#C9A84C; margin-bottom:8px; letter-spacing:0.3px; }
        .settlement-item { display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .settlement-item:last-child { border-bottom:none; }
        .settlement-names { flex:1; font-size:12px; color:#6B6560; }
        .settlement-amt { font-family:'Geist Mono',monospace; font-size:13px; font-weight:600; color:#6BA583; }
        .bill-row { display:flex; align-items:center; gap:12px; padding:11px 20px; border-bottom:1px solid rgba(255,255,255,0.04); }
        .bill-row:last-child { border-bottom:none; }
        .bill-icon { font-size:18px; width:28px; text-align:center; flex-shrink:0; }
        .bill-info { flex:1; }
        .bill-name { font-size:13px; font-weight:500; color:#C8C4BF; }
        .bill-due { font-size:11px; color:#3D3935; margin-top:1px; }
        .bill-amount { font-family:'Geist Mono',monospace; font-size:13px; color:#7A7570; margin-right:8px; }
        .bill-badge { font-size:10px; font-weight:600; padding:3px 8px; border-radius:20px; letter-spacing:0.3px; text-transform:uppercase; }
        .bill-pending { background:rgba(232,160,32,0.1); color:#E8A020; }
        .grocery-widget { padding:18px 20px; }
        .grocery-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px; }
        .grocery-spent-label { font-family:'Instrument Serif',serif; font-size:28px; color:#F0EDE8; letter-spacing:-0.5px; }
        .grocery-budget-label { font-family:'Geist Mono',monospace; font-size:12px; color:#3D3935; }
        .grocery-track-outer { height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; margin-bottom:12px; }
        .grocery-track-fill { height:100%; border-radius:3px; }
        .grocery-remaining-box { display:flex; justify-content:space-between; align-items:center; background:rgba(107,165,131,0.08); border:1px solid rgba(107,165,131,0.15); border-radius:10px; padding:11px 14px; }
        .grocery-rem-label { font-size:10px; color:#6BA583; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; }
        .grocery-rem-value { font-family:'Geist Mono',monospace; font-size:18px; font-weight:600; color:#6BA583; }
        .m-avatar { border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; color:#0E0F11; flex-shrink:0; }
        .empty { text-align:center; padding:28px 16px; font-size:13px; color:#3D3935; }

        @media (max-width: 1024px) {
          .dash-content { padding: 20px; }
          .summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dash-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 768px) {
          .dash-root { min-height: calc(100vh - 56px); overflow-x: hidden; }
          .dash-topbar { padding: 10px 14px; height: auto; min-height: 56px; align-items: flex-start; gap: 10px; }
          .dash-topbar-right { width: 100%; flex-wrap: wrap; gap: 8px; }
          .month-select { flex: 1; min-width: 150px; }
          .topbar-btn { width: 100%; justify-content: center; }
          .wallet-pill { width: 100%; justify-content: center; }
          .dash-content { padding: 14px; }
          .summary-strip { grid-template-columns: 1fr; }
          .summary-cell { padding: 16px; }
          .summary-cell-value { font-size: 24px; }
          .panel-header,
          .panel-body,
          .exp-row,
          .bal-row,
          .bill-row,
          .grocery-widget { padding-left: 14px; padding-right: 14px; }
          .settlement-callout { margin-left: 14px; margin-right: 14px; }
        }
      `}</style>

      <div className="dash-root">
        <div className="dash-topbar">
          <span className="dash-topbar-title">Dashboard</span>
          <div className="dash-topbar-right">
            {wallet && <span className="wallet-pill">💰 {formatCurrency(wallet.balance)}</span>}
            <MonthSelector />
            <Link href="/expenses" className="topbar-btn">＋ Expense</Link>
          </div>
        </div>

        <div className="dash-content">
          <div className="summary-strip">
            <SummaryCell label="Monthly Income" value={formatCurrency(monthlyIncome)} sub="Household total budget" accent="#C9A84C" />
            <SummaryCell label="Total Spent" value={formatCurrency(totalSpent)} sub={`${Math.round(spentPct)}% of income`} accent="#E07B6A" progress={spentPct} progressColor="#E07B6A" />
            <SummaryCell label="Remaining" value={formatCurrency(remaining)} sub={remaining < 0 ? 'Over budget' : 'Available'} accent={remaining < 0 ? '#E07B6A' : '#6BA583'} />
            <SummaryCell label="Pending Bills" value={formatCurrency(pendingTotal)} sub={`${pendingBills.length} bill${pendingBills.length !== 1 ? 's' : ''} due`} accent="#7B9EC9" />
          </div>

          <div className="dash-grid">
            <div className="dash-left">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Budget Categories</span>
                  <Link href="/categories" className="panel-link">View all →</Link>
                </div>
                <div className="panel-body">
                  {categories.slice(0, 6).map(cat => {
                    const spent = expenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + e.amount, 0);
                    const limit = cat.budget_limit ?? 0;
                    const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
                    const status = limit > 0 ? getBudgetStatus(spent, limit) : 'ok';
                    const fillColor = status === 'over' ? '#E07B6A' : status === 'warning' ? '#E8A020' : '#6BA583';
                    return (
                      <div key={cat.id} className="cat-row">
                        <div className="cat-row-top">
                          <span className="cat-name">
                            <span className="cat-dot" style={{ background: cat.color }} />
                            {cat.icon} {cat.name}
                          </span>
                          <span className="cat-amounts">
                            <strong>{formatCurrency(spent)}</strong>
                            {limit > 0 && ` / ${formatCurrency(limit)}`}
                          </span>
                        </div>
                        {limit > 0 && (
                          <div className="cat-track">
                            <div className="cat-fill" style={{ width: `${pct}%`, background: fillColor }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {categories.length === 0 && <p className="empty">No categories yet</p>}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Recent Expenses</span>
                  <Link href="/expenses" className="panel-link">View all →</Link>
                </div>
                {expenses.slice(0, 6).map(exp => {
                  const cat = categories.find(c => c.id === exp.category_id);
                  const payer = members.find(m => m.id === exp.paid_by);
                  return (
                    <div key={exp.id} className="exp-row">
                      <div className="exp-icon" style={{ background: (cat?.color ?? '#6B6560') + '18' }}>
                        {cat?.icon ?? '📦'}
                      </div>
                      <div className="exp-info">
                        <div className="exp-name">{exp.name}</div>
                        <div className="exp-meta">{exp.date} · {payer?.name}</div>
                      </div>
                      <span className="exp-amount">{formatCurrency(exp.amount)}</span>
                    </div>
                  );
                })}
                {expenses.length === 0 && <p className="empty">No expenses this month</p>}
              </div>
            </div>

            <div className="dash-right">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Who Owes What</span>
                  <Link href="/balances" className="panel-link">Details →</Link>
                </div>
                {balances.slice(0, 4).map((bal, i) => {
                  const fromM = members.find(m => m.id === bal.from_member_id);
                  const toM = members.find(m => m.id === bal.to_member_id);
                  return (
                    <div key={i} className="bal-row">
                      <MemberAvatar member={fromM} size={28} />
                      <div className="bal-info">
                        <div className="bal-name">{fromM?.name} → {toM?.name}</div>
                        <div className="bal-sub">Unsettled</div>
                      </div>
                      <span className="bal-amount">{formatCurrency(bal.amount)}</span>
                      <button className="bal-settle">Settle</button>
                    </div>
                  );
                })}
                {balances.length === 0 && <p className="empty">All settled up 🎉</p>}
                {settlements.length > 0 && (
                  <div className="settlement-callout">
                    <div className="settlement-callout-title">💡 {settlements.length} payment{settlements.length !== 1 ? 's' : ''} to clear everything</div>
                    {settlements.map((s, i) => {
                      const fromM = members.find(m => m.id === s.from_member_id);
                      const toM = members.find(m => m.id === s.to_member_id);
                      return (
                        <div key={i} className="settlement-item">
                          <MemberAvatar member={fromM} size={20} />
                          <span className="settlement-names">{fromM?.name} pays {toM?.name}</span>
                          <span className="settlement-amt">{formatCurrency(s.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Upcoming Bills</span>
                  <Link href="/bills" className="panel-link">All bills →</Link>
                </div>
                {pendingBills.slice(0, 4).map(bill => (
                  <div key={bill.id} className="bill-row">
                    <span className="bill-icon">{bill.icon}</span>
                    <div className="bill-info">
                      <div className="bill-name">{bill.name}</div>
                      <div className="bill-due">Due {bill.due_date}</div>
                    </div>
                    <span className="bill-amount">{formatCurrency(bill.amount)}</span>
                    <span className="bill-badge bill-pending">{bill.status === 'overdue' ? 'Overdue' : 'Due'}</span>
                  </div>
                ))}
                {pendingBills.length === 0 && <p className="empty">No pending bills ✓</p>}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Grocery Budget</span>
                  <Link href="/grocery" className="panel-link">Details →</Link>
                </div>
                <div className="grocery-widget">
                  <div className="grocery-header">
                    <span className="grocery-spent-label">{formatCurrency(grocerySpent)}</span>
                    <span className="grocery-budget-label">of {formatCurrency(groceryCat?.budget_limit ?? 0)}</span>
                  </div>
                  <div className="grocery-track-outer">
                    <div className="grocery-track-fill" style={{
                      width: `${groceryCat?.budget_limit ? Math.min((grocerySpent / groceryCat.budget_limit) * 100, 100) : 0}%`,
                      background: groceryCat?.budget_limit && grocerySpent > groceryCat.budget_limit ? '#E07B6A' : '#6BA583',
                    }} />
                  </div>
                  <div className="grocery-remaining-box">
                    <span className="grocery-rem-label">Remaining</span>
                    <span className="grocery-rem-value">{formatCurrency(Math.max(0, (groceryCat?.budget_limit ?? 0) - grocerySpent))}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryCell({ label, value, sub, accent, progress, progressColor }: {
  label: string; value: string; sub: string; accent: string;
  progress?: number; progressColor?: string;
}) {
  return (
    <div className="summary-cell">
      <div className="summary-cell-label">{label}</div>
      <div className="summary-cell-value">{value}</div>
      <div className="summary-cell-sub">{sub}</div>
      {progress !== undefined && progressColor && (
        <div className="summary-progress-track">
          <div className="summary-progress-fill" style={{ width: `${Math.min(progress, 100)}%`, background: progressColor }} />
        </div>
      )}
      <div className="summary-accent-line" style={{ background: accent }} />
    </div>
  );
}

function MonthSelector() {
  const { selectedMonth, setSelectedMonth } = useUIStore();
  const monthOptions = [
    { value: '2026-03', label: 'March 2026' },
    { value: '2026-02', label: 'February 2026' },
    { value: '2026-01', label: 'January 2026' },
  ];

  return (
    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="month-select">
      {monthOptions.map((month) => {
        return <option key={month.value} value={month.value}>{month.label}</option>;
      })}
    </select>
  );
}

function MemberAvatar({ member, size = 32 }: { member?: Member; size?: number }) {
  const palette = ['#C9A84C', '#E07B6A', '#7B9EC9', '#9B84C4', '#6BA583', '#C4946A'];
  const color = palette[(member?.name?.charCodeAt(0) ?? 0) % palette.length];
  return (
    <div className="m-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {member?.name?.[0] ?? '?'}
    </div>
  );
}
