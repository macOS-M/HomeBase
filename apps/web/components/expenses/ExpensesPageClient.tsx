'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useExpensesAll, useCreateExpense, useDeleteExpense, useCategories, useMembers } from '@homebase/api';
import { useUIStore } from '@homebase/store';
import { calculateEqualSplits, calculatePercentageSplits, formatCurrency, formatRelativeDate } from '@homebase/utils';
import type { Household, Member, SplitType } from '@homebase/types';

function getLocalDateInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function buildMonthOptions(selectedMonth: string, count = 36) {
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(monthKey);
  }

  if (!months.includes(selectedMonth)) {
    months.unshift(selectedMonth);
  }

  return months;
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
  .ep { flex:1; background:#0E0F11; min-height:100vh; font-family:'Geist',sans-serif; color:#F0EDE8; }
  .ep-topbar { background:rgba(14,15,17,0.85); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); padding:0 32px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:50; }
  .ep-title { font-family:'Instrument Serif',serif; font-size:18px; color:#F0EDE8; }
  .ep-actions { display:flex; align-items:center; gap:10px; }
  .btn-gold { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; background:#C9A84C; color:#0E0F11; border-radius:8px; font-family:'Geist',sans-serif; font-size:13px; font-weight:600; border:none; cursor:pointer; }
  .btn-gold:hover { background:#D4B05A; }
  .btn-ghost { padding:7px 14px; background:rgba(255,255,255,0.05); color:#A8A29E; border-radius:8px; font-size:13px; font-weight:500; border:1px solid rgba(255,255,255,0.08); cursor:pointer; font-family:'Geist',sans-serif; }
  .btn-ghost:hover { background:rgba(255,255,255,0.09); color:#F0EDE8; }
  .ep-content { padding:28px 32px; }
  .ep-grid { display:grid; grid-template-columns:1fr 300px; gap:20px; align-items:start; }

  /* Summary */
  .ep-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:rgba(255,255,255,0.06); border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); margin-bottom:20px; }
  .ep-sc { background:#161719; padding:18px 22px; position:relative; }
  .ep-sc-label { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#4A4540; margin-bottom:6px; }
  .ep-sc-val { font-family:'Instrument Serif',serif; font-size:26px; color:#F0EDE8; letter-spacing:-0.5px; line-height:1; }
  .ep-sc-sub { font-size:11px; color:#3D3935; margin-top:5px; font-family:'Geist Mono',monospace; }
  .ep-sc-bar { position:absolute; bottom:0; left:0; right:0; height:2px; }

  /* Panel */
  .panel { background:#161719; border:1px solid rgba(255,255,255,0.06); border-radius:16px; overflow:hidden; }
  .panel-hdr { padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:space-between; }
  .panel-title { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#C9A84C; }
  .panel-sub { font-size:12px; color:#3D3935; font-family:'Geist Mono',monospace; }

  /* Form */
  .ep-form { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .fld { display:flex; flex-direction:column; gap:5px; }
  .fld-label { font-size:10px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:#4A4540; }
  .fld-input { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:9px 12px; font-family:'Geist',sans-serif; font-size:13px; color:#F0EDE8; outline:none; width:100%; }
  .fld-input:focus { border-color:rgba(201,168,76,0.4); }
  .fld-input::placeholder { color:#3D3935; }
  select.fld-input { background:#1f2022; color:#F0EDE8; }
  select.fld-input option { background:#1f2022; color:#F0EDE8; }
  .form-error { font-size:12px; color:#E07B6A; }

  /* Expense list */
  .exp-row { display:flex; align-items:center; gap:12px; padding:13px 20px; border-bottom:1px solid rgba(255,255,255,0.04); transition:background 0.15s; }
  .exp-row:last-child { border-bottom:none; }
  .exp-row:hover { background:rgba(255,255,255,0.02); }
  .exp-row:hover .exp-del { opacity:1; }
  .exp-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
  .exp-info { flex:1; min-width:0; }
  .exp-name { font-size:13px; font-weight:500; color:#D4D0CB; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .exp-meta { font-size:11px; color:#3D3935; margin-top:2px; }
  .exp-amount { font-family:'Geist Mono',monospace; font-size:14px; font-weight:500; color:#A8A29E; flex-shrink:0; }
  .exp-del { opacity:0; background:rgba(224,123,106,0.08); border:1px solid rgba(224,123,106,0.15); border-radius:6px; color:#E07B6A; font-size:12px; padding:4px 8px; cursor:pointer; font-family:'Geist',sans-serif; transition:all 0.15s; }
  .exp-del:hover { background:rgba(224,123,106,0.15); }

  /* Filters */
  .filter-row { display:flex; gap:6px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.05); flex-wrap:wrap; }
  .filter-btn { font-size:12px; padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:#6B6560; cursor:pointer; font-family:'Geist',sans-serif; transition:all 0.15s; }
  .filter-btn:hover { color:#C8C4BF; }
  .filter-btn.active { background:rgba(201,168,76,0.1); border-color:rgba(201,168,76,0.3); color:#C9A84C; }

  /* Right sidebar — breakdown */
  .breakdown-row { display:flex; align-items:center; justify-content:space-between; padding:10px 20px; border-bottom:1px solid rgba(255,255,255,0.04); }
  .breakdown-row:last-child { border-bottom:none; }
  .breakdown-left { display:flex; align-items:center; gap:10px; }
  .breakdown-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .breakdown-name { font-size:13px; color:#C8C4BF; }
  .breakdown-right { display:flex; align-items:center; gap:10px; }
  .breakdown-amt { font-family:'Geist Mono',monospace; font-size:13px; color:#7A7570; }
  .breakdown-pct { font-size:11px; color:#3D3935; width:30px; text-align:right; font-family:'Geist Mono',monospace; }

  /* Month selector */
  .month-sel { background:#1f2022; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:6px 12px; font-family:'Geist',sans-serif; font-size:13px; color:#F0EDE8; cursor:pointer; outline:none; }
  .month-sel option { background:#1f2022; color:#F0EDE8; }

  /* Toast */
  .toast { position:fixed; bottom:28px; right:28px; background:#1E1F22; border:1px solid rgba(255,255,255,0.1); color:#F0EDE8; padding:11px 18px; border-radius:10px; font-size:13px; font-weight:500; box-shadow:0 8px 32px rgba(0,0,0,0.4); z-index:9999; animation:toastIn 0.2s ease; }
  @keyframes toastIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .empty { text-align:center; padding:36px 16px; font-size:13px; color:#3D3935; }
`;

export function ExpensesPageClient({ household, member }: { household: Household; member: Member }) {
  const supabase = createClient();
  const { selectedMonth, setSelectedMonth } = useUIStore();

  const {
    data: allExpenses = [],
    error: expensesError,
    isLoading: expensesLoading,
  } = useExpensesAll(supabase, household.id);
  const { data: categories = [], error: categoriesError } = useCategories(supabase, household.id);
  const { data: members = [], error: membersError } = useMembers(supabase, household.id);
  const createExpense = useCreateExpense(supabase, household.id);
  const deleteExpense = useDeleteExpense(supabase, household.id);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paidBy, setPaidBy] = useState(member.id);
  const [date, setDate] = useState(getLocalDateInputValue());
  const [splitType, setSplitType] = useState<SplitType>(
    household.default_split_type === 'percentage' ? 'percentage' : 'equal'
  );
  const [filterCat, setFilterCat] = useState('all');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const monthOptions = useMemo(() => buildMonthOptions(selectedMonth), [selectedMonth]);
  const queryError = expensesError || categoriesError || membersError;
  const expenses = useMemo(
    () => allExpenses.filter((expense) => expense.date?.startsWith(selectedMonth)),
    [allExpenses, selectedMonth]
  );

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2800); }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseCount = expenses.length;
  const avgExpense = expenseCount > 0 ? totalSpent / expenseCount : 0;

  const filtered = filterCat === 'all' ? expenses : expenses.filter(e => e.category_id === filterCat);

  // Category breakdown
  const breakdown = useMemo(() => {
    const map: Record<string, { name: string; icon: string; color: string; total: number }> = {};
    for (const exp of expenses) {
      const cat = categories.find(c => c.id === exp.category_id);
      const key = exp.category_id ?? 'uncategorized';
      if (!map[key]) map[key] = { name: cat?.name ?? 'Uncategorized', icon: cat?.icon ?? '📦', color: cat?.color ?? '#6B6560', total: 0 };
      map[key].total += exp.amount;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses, categories]);

  function buildPercentageSplits(totalAmount: number) {
    const totalBudget = members.reduce((sum, m) => sum + Math.max(0, m.monthly_budget ?? 0), 0);
    if (totalBudget <= 0) {
      return calculateEqualSplits(totalAmount, members.map((m) => m.id));
    }

    const percentages = members.map((m) => ({
      member_id: m.id,
      percentage: ((Math.max(0, m.monthly_budget ?? 0) / totalBudget) * 100),
    }));

    return calculatePercentageSplits(totalAmount, percentages);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) { setError('Amount must be > 0'); return; }
    if (!categoryId) { setError('Pick a category'); return; }
    setError('');
    try {
      const splits =
        splitType === 'percentage'
          ? buildPercentageSplits(parsed)
          : calculateEqualSplits(parsed, members.map((m) => m.id));

      await createExpense.mutateAsync({
        name, amount: parsed, category_id: categoryId, paid_by: paidBy,
        split_type: splitType, splits, date,
      });
      setName(''); setAmount(''); setCategoryId(''); setPaidBy(member.id);
      setDate(getLocalDateInputValue());
      setSplitType(household.default_split_type === 'percentage' ? 'percentage' : 'equal');
      setFilterCat('all');
      setSelectedMonth(date.slice(0, 7));
      setShowForm(false);
      showToast('✅ Expense added');
    } catch (err: any) { setError(err?.message ?? 'Failed'); }
  }

  async function handleDelete(id: string, expName: string) {
    if (!confirm(`Delete "${expName}"?`)) return;
    await deleteExpense.mutateAsync(id);
    showToast('🗑️ Expense deleted');
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="ep">
        <div className="ep-topbar">
          <span className="ep-title">Expenses</span>
          <div className="ep-actions">
            <select className="month-sel" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {monthOptions.map(m => {
                const [y, mo] = m.split('-');
                return <option key={m} value={m}>{new Date(+y,+mo-1).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</option>;
              })}
            </select>
            <button className="btn-ghost" onClick={() => setShowForm(f => !f)}>{showForm ? '✕ Cancel' : '＋ Add Expense'}</button>
          </div>
        </div>

        <div className="ep-content">
          {/* Summary */}
          <div className="ep-summary">
            <div className="ep-sc">
              <div className="ep-sc-label">Total Spent</div>
              <div className="ep-sc-val">{formatCurrency(totalSpent)}</div>
              <div className="ep-sc-sub">{expenseCount} expense{expenseCount !== 1 ? 's' : ''}</div>
              <div className="ep-sc-bar" style={{background:'#E07B6A'}} />
            </div>
            <div className="ep-sc">
              <div className="ep-sc-label">Avg per Expense</div>
              <div className="ep-sc-val">{formatCurrency(avgExpense)}</div>
              <div className="ep-sc-sub">this month</div>
              <div className="ep-sc-bar" style={{background:'#C9A84C'}} />
            </div>
            <div className="ep-sc">
              <div className="ep-sc-label">Categories Used</div>
              <div className="ep-sc-val">{breakdown.length}</div>
              <div className="ep-sc-sub">of {categories.length} total</div>
              <div className="ep-sc-bar" style={{background:'#6BA583'}} />
            </div>
          </div>

          <div className="ep-grid">
            <div>
              {/* Add form */}
              {showForm && (
                <div className="panel" style={{marginBottom:16}}>
                  <div className="panel-hdr"><span className="panel-title">New Expense</span></div>
                  <form onSubmit={onSubmit} className="ep-form">
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Description</label>
                        <input className="fld-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly groceries" required />
                      </div>
                      <div className="fld">
                        <label className="fld-label">Amount ($)</label>
                        <input className="fld-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" required />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Category</label>
                        <select className="fld-input" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                          <option value="">Select category…</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                        </select>
                      </div>
                      <div className="fld">
                        <label className="fld-label">Paid by</label>
                        <select className="fld-input" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Date</label>
                        <input className="fld-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                      </div>
                      <div className="fld">
                        <label className="fld-label">Split Type</label>
                        <select className="fld-input" value={splitType} onChange={e => setSplitType(e.target.value as SplitType)}>
                          <option value="equal">Equal</option>
                          <option value="percentage">By Member % (Budget Share)</option>
                        </select>
                      </div>
                    </div>
                    {splitType === 'percentage' && (
                      <div className="panel-sub">Uses each member monthly budget as their share of each expense (for example 60/40).</div>
                    )}
                    <div className="form-row">
                      <div className="fld" style={{justifyContent:'flex-end'}}>
                        <button type="submit" className="btn-gold" disabled={createExpense.isPending} style={{height:38}}>
                          {createExpense.isPending ? 'Adding…' : 'Add Expense'}
                        </button>
                      </div>
                    </div>
                    {error && <div className="form-error">{error}</div>}
                  </form>
                </div>
              )}

              {/* List */}
              <div className="panel">
                <div className="panel-hdr">
                  <span className="panel-title">All Expenses</span>
                  <span className="panel-sub">{filtered.length} entries</span>
                </div>
                {/* Category filters */}
                <div className="filter-row">
                  <button className={`filter-btn${filterCat==='all'?' active':''}`} onClick={() => setFilterCat('all')}>All</button>
                  {breakdown.map(b => {
                    const cat = categories.find(c => c.name === b.name);
                    return (
                      <button key={b.name} className={`filter-btn${filterCat===cat?.id?' active':''}`} onClick={() => setFilterCat(cat?.id ?? 'all')}>
                        {b.icon} {b.name}
                      </button>
                    );
                  })}
                </div>
                {queryError ? (
                  <div className="empty">Unable to load expenses: {queryError.message}</div>
                ) : expensesLoading ? (
                  <div className="empty">Loading expenses…</div>
                ) : filtered.length === 0 ? (
                  <div className="empty">No expenses{filterCat !== 'all' ? ' in this category' : ' this month'}</div>
                ) : (
                  filtered.map(exp => {
                    const cat = categories.find(c => c.id === exp.category_id);
                    const payer = members.find(m => m.id === exp.paid_by);
                    return (
                      <div key={exp.id} className="exp-row">
                        <div className="exp-icon" style={{background:(cat?.color??'#6B6560')+'18'}}>{cat?.icon??'📦'}</div>
                        <div className="exp-info">
                          <div className="exp-name">{exp.name}</div>
                          <div className="exp-meta">{formatRelativeDate(exp.date)} · {cat?.name??'Uncategorized'} · {payer?.name}</div>
                        </div>
                        <span className="exp-amount">{formatCurrency(exp.amount)}</span>
                        <button className="exp-del" onClick={() => handleDelete(exp.id, exp.name)}>✕</button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Breakdown sidebar */}
            <div>
              <div className="panel">
                <div className="panel-hdr"><span className="panel-title">By Category</span></div>
                {breakdown.length === 0 ? <div className="empty">No data yet</div> : breakdown.map(b => (
                  <div key={b.name} className="breakdown-row">
                    <div className="breakdown-left">
                      <div className="breakdown-dot" style={{background:b.color}} />
                      <span className="breakdown-name">{b.icon} {b.name}</span>
                    </div>
                    <div className="breakdown-right">
                      <span className="breakdown-amt">{formatCurrency(b.total)}</span>
                      <span className="breakdown-pct">{totalSpent > 0 ? Math.round((b.total/totalSpent)*100) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* By member */}
              <div className="panel" style={{marginTop:16}}>
                <div className="panel-hdr"><span className="panel-title">By Member</span></div>
                {members.map(m => {
                  const paid = expenses.filter(e => e.paid_by === m.id).reduce((s, e) => s + e.amount, 0);
                  const pct = totalSpent > 0 ? (paid / totalSpent) * 100 : 0;
                  const palette = ['#C9A84C','#E07B6A','#7B9EC9','#9B84C4','#6BA583'];
                  const color = palette[members.indexOf(m) % palette.length];
                  return (
                    <div key={m.id} className="breakdown-row">
                      <div className="breakdown-left">
                        <div style={{width:28,height:28,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#0E0F11',flexShrink:0}}>{m.name[0]}</div>
                        <span className="breakdown-name">{m.name}</span>
                      </div>
                      <div className="breakdown-right">
                        <span className="breakdown-amt">{formatCurrency(paid)}</span>
                        <span className="breakdown-pct">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}