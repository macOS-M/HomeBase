'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBills, useCreateBill, useDeleteBill, useToggleBillStatus } from '@homebase/api';
import { formatCurrency, getDaysUntilDue } from '@homebase/utils';
import type { Household } from '@homebase/types';

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
  .bp { flex:1; background:#0E0F11; min-height:100vh; font-family:'Geist',sans-serif; color:#F0EDE8; }
  .bp-topbar { background:rgba(14,15,17,0.85); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); padding:0 32px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:50; }
  .bp-title { font-family:'Instrument Serif',serif; font-size:18px; color:#F0EDE8; }
  .bp-actions { display:flex; align-items:center; gap:10px; }
  .btn-gold { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; background:#C9A84C; color:#0E0F11; border-radius:8px; font-size:13px; font-weight:600; border:none; cursor:pointer; }
  .btn-gold:hover { background:#D4B05A; }
  .btn-ghost { padding:7px 14px; background:rgba(255,255,255,0.05); color:#A8A29E; border-radius:8px; font-size:13px; font-weight:500; border:1px solid rgba(255,255,255,0.08); cursor:pointer; }
  .btn-ghost:hover { background:rgba(255,255,255,0.09); color:#F0EDE8; }
  .bp-content { padding:28px 32px; }
  .bp-grid { display:grid; grid-template-columns:1fr 300px; gap:20px; align-items:start; }

  .bp-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:rgba(255,255,255,0.06); border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); margin-bottom:20px; }
  .bp-sc { background:#161719; padding:18px 22px; position:relative; }
  .bp-sc-label { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#4A4540; margin-bottom:6px; }
  .bp-sc-val { font-family:'Instrument Serif',serif; font-size:26px; color:#F0EDE8; letter-spacing:-0.5px; line-height:1; }
  .bp-sc-sub { font-size:11px; color:#3D3935; margin-top:5px; font-family:'Geist Mono',monospace; }
  .bp-sc-bar { position:absolute; bottom:0; left:0; right:0; height:2px; }

  .panel { background:#161719; border:1px solid rgba(255,255,255,0.06); border-radius:16px; overflow:hidden; }
  .panel-hdr { padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:space-between; }
  .panel-title { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#C9A84C; }
  .panel-sub { font-size:12px; color:#3D3935; font-family:'Geist Mono',monospace; }

  .bp-form { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .fld { display:flex; flex-direction:column; gap:5px; }
  .fld-label { font-size:10px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:#4A4540; }
  .fld-input { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:9px 12px; font-size:13px; color:#F0EDE8; outline:none; width:100%; }
  .fld-input:focus { border-color:rgba(201,168,76,0.4); }
  select.fld-input { background:#1f2022; color:#F0EDE8; }
  select.fld-input option { background:#1f2022; color:#F0EDE8; }
  .form-error { font-size:12px; color:#E07B6A; }

  .tab-row { display:flex; gap:6px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.05); }
  .tab-btn { font-size:12px; padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:#6B6560; cursor:pointer; }
  .tab-btn.active { background:rgba(201,168,76,0.1); border-color:rgba(201,168,76,0.3); color:#C9A84C; }

  .bill-row { display:flex; align-items:center; gap:12px; padding:13px 20px; border-bottom:1px solid rgba(255,255,255,0.04); }
  .bill-row:last-child { border-bottom:none; }
  .bill-row.overdue { background:rgba(224,123,106,0.05); }
  .bill-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; background:rgba(255,255,255,0.04); flex-shrink:0; }
  .bill-info { flex:1; min-width:0; }
  .bill-name { font-size:13px; font-weight:500; color:#D4D0CB; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bill-meta { font-size:11px; color:#3D3935; margin-top:2px; }
  .bill-amount { font-family:'Geist Mono',monospace; font-size:14px; font-weight:500; color:#A8A29E; }
  .bill-badge { font-size:10px; font-weight:600; padding:3px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:0.3px; }
  .pending { background:rgba(232,160,32,0.12); color:#E8A020; }
  .paid { background:rgba(107,165,131,0.12); color:#6BA583; }
  .overdue { background:rgba(224,123,106,0.12); color:#E07B6A; }
  .btn-mini { font-size:12px; padding:5px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:#C8C4BF; cursor:pointer; }
  .btn-mini:hover { background:rgba(255,255,255,0.08); }
  .btn-mini:disabled { opacity:0.45; cursor:not-allowed; }
  .btn-danger { border-color:rgba(224,123,106,0.25); color:#E07B6A; background:rgba(224,123,106,0.08); }
  .btn-danger:hover { background:rgba(224,123,106,0.16); }

  .empty { text-align:center; padding:36px 16px; font-size:13px; color:#3D3935; }
  .toast { position:fixed; bottom:28px; right:28px; background:#1E1F22; border:1px solid rgba(255,255,255,0.1); color:#F0EDE8; padding:11px 18px; border-radius:10px; font-size:13px; font-weight:500; box-shadow:0 8px 32px rgba(0,0,0,0.4); z-index:9999; }
`;

function getLocalDateInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

const BILL_ICON_OPTIONS = [
  { value: '📄', label: 'General' },
  { value: '⚡', label: 'Electricity' },
  { value: '💧', label: 'Water' },
  { value: '🔥', label: 'Gas' },
  { value: '🌐', label: 'Internet' },
  { value: '📱', label: 'Phone' },
  { value: '🏠', label: 'Rent / Mortgage' },
  { value: '🧾', label: 'Insurance' },
  { value: '🚗', label: 'Car / Transport' },
  { value: '💳', label: 'Credit Card' },
  { value: '🎓', label: 'Tuition' },
  { value: '🛒', label: 'Groceries' },
];

export function BillsPageClient({ household }: { household: Household }) {
  const supabase = createClient();
  const { data: bills = [] } = useBills(supabase, household.id);
  const createBill = useCreateBill(supabase, household.id);
  const deleteBill = useDeleteBill(supabase, household.id);
  const toggleBill = useToggleBillStatus(supabase, household.id);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📄');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(getLocalDateInputValue());
  const [recurring, setRecurring] = useState<'monthly' | 'weekly' | 'yearly' | 'once'>('monthly');
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  const pendingBills = useMemo(() => bills.filter((bill) => bill.status === 'pending'), [bills]);
  const overdueBills = useMemo(
    () => bills.filter((bill) => bill.status === 'overdue' || (bill.status === 'pending' && getDaysUntilDue(bill.due_date) < 0)),
    [bills]
  );
  const paidBills = useMemo(() => bills.filter((bill) => bill.status === 'paid'), [bills]);
  const pendingTotal = useMemo(() => pendingBills.reduce((sum, bill) => sum + bill.amount, 0), [pendingBills]);

  const filteredBills = useMemo(() => {
    if (filter === 'all') return bills;
    if (filter === 'paid') return paidBills;
    if (filter === 'pending') return pendingBills;
    return overdueBills;
  }, [filter, bills, paidBills, pendingBills, overdueBills]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    try {
      await createBill.mutateAsync({
        name,
        icon,
        amount: parsed,
        due_date: dueDate,
        recurring,
      });
      setName('');
      setIcon('📄');
      setAmount('');
      setDueDate(getLocalDateInputValue());
      setRecurring('monthly');
      setShowForm(false);
      showToast('✅ Bill added');
    } catch (err: any) {
      setError(err?.message ?? 'Unable to add bill.');
    }
  }

  async function handleToggle(billId: string, status: 'paid' | 'pending' | 'overdue') {
    const nextStatus: 'paid' | 'pending' = status === 'paid' ? 'pending' : 'paid';
    try {
      await toggleBill.mutateAsync({ billId, status: nextStatus });
      showToast(nextStatus === 'paid' ? '✅ Payment recorded' : '↩︎ Marked pending');
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'Unable to update bill status.');
    }
  }

  async function handleDelete(billId: string, billName: string) {
    if (!confirm(`Delete "${billName}"?`)) return;
    setDeletingBillId(billId);
    try {
      await deleteBill.mutateAsync(billId);
      showToast('🗑️ Bill deleted');
    } finally {
      setDeletingBillId(null);
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="bp">
        <div className="bp-topbar">
          <span className="bp-title">Bills</span>
          <div className="bp-actions">
            <button className="btn-ghost" onClick={() => setShowForm((value) => !value)}>
              {showForm ? '✕ Cancel' : '＋ Add Bill'}
            </button>
          </div>
        </div>

        <div className="bp-content">
          <div className="bp-summary">
            <div className="bp-sc">
              <div className="bp-sc-label">Pending Total</div>
              <div className="bp-sc-val">{formatCurrency(pendingTotal)}</div>
              <div className="bp-sc-sub">{pendingBills.length} pending</div>
              <div className="bp-sc-bar" style={{ background: '#E8A020' }} />
            </div>
            <div className="bp-sc">
              <div className="bp-sc-label">Overdue Bills</div>
              <div className="bp-sc-val">{overdueBills.length}</div>
              <div className="bp-sc-sub">requires attention</div>
              <div className="bp-sc-bar" style={{ background: '#E07B6A' }} />
            </div>
            <div className="bp-sc">
              <div className="bp-sc-label">Paid Bills</div>
              <div className="bp-sc-val">{paidBills.length}</div>
              <div className="bp-sc-sub">already settled</div>
              <div className="bp-sc-bar" style={{ background: '#6BA583' }} />
            </div>
          </div>

          <div className="bp-grid">
            <div>
              {showForm && (
                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="panel-hdr"><span className="panel-title">New Bill</span></div>
                  <form onSubmit={onSubmit} className="bp-form">
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Bill name</label>
                        <input className="fld-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Electricity" />
                      </div>
                      <div className="fld">
                        <label className="fld-label">Icon</label>
                        <select className="fld-input" value={icon} onChange={(e) => setIcon(e.target.value)}>
                          {BILL_ICON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.value} {opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Amount</label>
                        <input className="fld-input" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" required />
                      </div>
                      <div className="fld">
                        <label className="fld-label">Due date</label>
                        <input className="fld-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" required />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Recurring</label>
                        <select className="fld-input" value={recurring} onChange={(e) => setRecurring(e.target.value as 'monthly' | 'weekly' | 'yearly' | 'once')}>
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                          <option value="yearly">Yearly</option>
                          <option value="once">Once</option>
                        </select>
                      </div>
                      <div className="fld" style={{ justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn-gold" disabled={createBill.isPending} style={{ height: 38 }}>
                          {createBill.isPending ? 'Adding…' : 'Add Bill'}
                        </button>
                      </div>
                    </div>
                    {error && <div className="form-error">{error}</div>}
                  </form>
                </div>
              )}

              <div className="panel">
                <div className="panel-hdr">
                  <span className="panel-title">All Bills</span>
                  <span className="panel-sub">{filteredBills.length} entries</span>
                </div>

                <div className="tab-row">
                  <button className={`tab-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
                  <button className={`tab-btn${filter === 'pending' ? ' active' : ''}`} onClick={() => setFilter('pending')}>Pending</button>
                  <button className={`tab-btn${filter === 'overdue' ? ' active' : ''}`} onClick={() => setFilter('overdue')}>Overdue</button>
                  <button className={`tab-btn${filter === 'paid' ? ' active' : ''}`} onClick={() => setFilter('paid')}>Paid</button>
                </div>
                {error && <div className="form-error" style={{ padding: '10px 20px 0' }}>{error}</div>}

                {filteredBills.length === 0 ? (
                  <div className="empty">No bills in this filter</div>
                ) : (
                  filteredBills.map((bill) => {
                    const daysLeft = getDaysUntilDue(bill.due_date);
                    const isOverdue = bill.status === 'overdue' || (bill.status === 'pending' && daysLeft < 0);
                    const canPayCycle = bill.recurring === 'once' || daysLeft <= 7;
                    const canReopen = bill.status === 'paid' && bill.recurring === 'once';
                    const canChangeStatus = bill.status === 'paid' ? canReopen : canPayCycle;
                    const dueLabel =
                      daysLeft < 0
                        ? `${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0
                          ? 'due today'
                          : `${daysLeft}d left`;

                    return (
                      <div key={bill.id} className={`bill-row${isOverdue ? ' overdue' : ''}`}>
                        <div className="bill-icon">{bill.icon}</div>
                        <div className="bill-info">
                          <div className="bill-name">{bill.name}</div>
                          <div className="bill-meta">
                            Due {bill.due_date} · {dueLabel} · {bill.recurring}
                            {bill.paid_at ? ` · Last paid ${new Date(bill.paid_at).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <span className="bill-amount">{formatCurrency(bill.amount)}</span>
                        <span className={`bill-badge ${bill.status === 'paid' ? 'paid' : isOverdue ? 'overdue' : 'pending'}`}>
                          {bill.status === 'paid' ? 'Paid' : isOverdue ? 'Overdue' : 'Pending'}
                        </span>
                        <button
                          className="btn-mini"
                          disabled={!canChangeStatus}
                          onClick={() => handleToggle(bill.id, bill.status)}
                          title={!canChangeStatus ? (bill.status === 'paid' ? 'Recurring paid bills are kept as history.' : 'You can pay recurring bills up to 7 days before due date.') : undefined}
                        >
                          {bill.status === 'paid'
                            ? bill.recurring === 'once' ? 'Mark pending' : 'Paid'
                            : bill.recurring === 'once'
                              ? 'Mark paid'
                              : canChangeStatus
                                ? 'Pay cycle'
                                : 'Not due yet'}
                        </button>
                        <button
                          className="btn-mini btn-danger"
                          disabled={deletingBillId === bill.id}
                          onClick={() => handleDelete(bill.id, bill.name)}
                        >
                          {deletingBillId === bill.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="panel">
                <div className="panel-hdr"><span className="panel-title">Upcoming</span></div>
                {pendingBills.length === 0 ? (
                  <div className="empty">No pending bills</div>
                ) : (
                  pendingBills.slice(0, 8).map((bill) => {
                    const daysLeft = getDaysUntilDue(bill.due_date);
                    const isOverdue = daysLeft < 0;
                    return (
                      <div key={bill.id} className={`bill-row${isOverdue ? ' overdue' : ''}`}>
                        <div className="bill-icon">{bill.icon}</div>
                        <div className="bill-info">
                          <div className="bill-name">{bill.name}</div>
                          <div className="bill-meta">{isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'due today' : `${daysLeft}d left`}</div>
                        </div>
                        <span className="bill-amount">{formatCurrency(bill.amount)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
