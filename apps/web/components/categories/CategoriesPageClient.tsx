'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCategories, useExpenses, queryKeys } from '@homebase/api';
import { formatCurrency, getBudgetStatus } from '@homebase/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@homebase/store';
import type { Household, Category } from '@homebase/types';

const DEFAULT_CATEGORIES = [
  { name: 'Rent',               icon: '🏠', color: '#2B4C7E', budget_limit: null,  is_grocery: false },
  { name: 'Groceries',          icon: '🛒', color: '#2D5F3F', budget_limit: 500,   is_grocery: true  },
  { name: 'Utilities',          icon: '⚡', color: '#E8A020', budget_limit: 200,   is_grocery: false },
  { name: 'Internet',           icon: '🌐', color: '#7B5EA7', budget_limit: 80,    is_grocery: false },
  { name: 'Subscriptions',      icon: '📱', color: '#C84B31', budget_limit: 120,   is_grocery: false },
  { name: 'Household Supplies', icon: '🧹', color: '#5A8A6A', budget_limit: 100,   is_grocery: false },
  { name: 'Eating Out',         icon: '🍽️', color: '#D4724E', budget_limit: 200,   is_grocery: false },
  { name: 'Health',             icon: '🏥', color: '#4A90A4', budget_limit: 150,   is_grocery: false },
  { name: 'Transport',          icon: '🚗', color: '#8B7355', budget_limit: 200,   is_grocery: false },
  { name: 'Other',              icon: '📦', color: '#6B6560', budget_limit: null,  is_grocery: false },
] as const;

const ICON_PICKS = ['🏠','🛒','⚡','🌐','📱','🧹','🍽️','🏥','🚗','📦','🎬','✈️','🐾','🎓','💊','🎮','👗','🍺'];

export function CategoriesPageClient({ household }: { household: Household }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { selectedMonth } = useUIStore();

  const { data: categories = [] } = useCategories(supabase, household.id);
  const { data: expenses = [] } = useExpenses(supabase, household.id, selectedMonth);

  // Compute spending per category from real expense data
  const spendingByCat = expenses.reduce<Record<string, number>>((acc, exp) => {
    if (exp.category_id) acc[exp.category_id] = (acc[exp.category_id] ?? 0) + exp.amount;
    return acc;
  }, {});

  const totalBudgeted = categories.reduce((s, c) => s + (c.budget_limit ?? 0), 0);
  const totalSpent = Object.values(spendingByCat).reduce((s, v) => s + v, 0);
  const overBudgetCount = categories.filter(c => {
    const spent = spendingByCat[c.id] ?? 0;
    return c.budget_limit && spent > c.budget_limit;
  }).length;

  // Add category form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#6B6560');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [isGrocery, setIsGrocery] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline budget editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Seed
  const [seedLoading, setSeedLoading] = useState(false);
  const [toast, setToast] = useState('');

  const existingNames = new Set(categories.map(c => c.name.trim().toLowerCase()));
  const missingDefaults = DEFAULT_CATEGORIES.filter(c => !existingNames.has(c.name.toLowerCase()));

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setFormError('Name is required.'); return; }
    if (existingNames.has(trimmed.toLowerCase())) { setFormError('Already exists.'); return; }
    const parsed = budgetLimit ? Number(budgetLimit) : null;
    if (budgetLimit && (!Number.isFinite(parsed) || parsed! < 0)) { setFormError('Invalid budget.'); return; }
    setFormLoading(true); setFormError('');
    const { error } = await supabase.from('categories').insert({
      household_id: household.id, name: trimmed, icon, color,
      budget_limit: parsed, is_grocery: isGrocery,
    });
    setFormLoading(false);
    if (error) { setFormError(error.message); return; }
    setName(''); setIcon('📦'); setColor('#6B6560'); setBudgetLimit(''); setIsGrocery(false);
    setShowForm(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.categories(household.id) });
    showToast('✅ Category added');
  }

  async function handleSeedDefaults() {
    if (!missingDefaults.length) { showToast('All defaults already added'); return; }
    setSeedLoading(true);
    const { error } = await supabase.from('categories').insert(
      missingDefaults.map(c => ({ household_id: household.id, ...c }))
    );
    setSeedLoading(false);
    if (error) { showToast('❌ ' + error.message); return; }
    await queryClient.invalidateQueries({ queryKey: queryKeys.categories(household.id) });
    showToast(`✅ Added ${missingDefaults.length} default categories`);
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditBudget(cat.budget_limit?.toString() ?? '');
  }

  async function saveBudget(cat: Category) {
    const parsed = editBudget.trim() === '' ? null : Number(editBudget);
    if (editBudget.trim() !== '' && (!Number.isFinite(parsed) || Number(parsed) < 0)) {
      showToast('❌ Invalid budget'); return;
    }
    setSavingId(cat.id);
    const { error } = await supabase.from('categories')
      .update({ budget_limit: parsed })
      .eq('id', cat.id).eq('household_id', household.id);
    setSavingId(null); setEditingId(null);
    if (error) { showToast('❌ ' + error.message); return; }
    await queryClient.invalidateQueries({ queryKey: queryKeys.categories(household.id) });
    showToast('✅ Budget updated');
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? Expenses using it will be uncategorized.')) return;
    await supabase.from('categories').delete().eq('id', id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.categories(household.id) });
    showToast('🗑️ Category deleted');
  }

  // Sort: over-budget first, then by spend desc
  const sorted = [...categories].sort((a, b) => {
    const aSpent = spendingByCat[a.id] ?? 0;
    const bSpent = spendingByCat[b.id] ?? 0;
    const aOver = a.budget_limit && aSpent > a.budget_limit ? 1 : 0;
    const bOver = b.budget_limit && bSpent > b.budget_limit ? 1 : 0;
    if (bOver !== aOver) return bOver - aOver;
    return bSpent - aSpent;
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
        .cat-page { flex:1; background:#0E0F11; min-height:100vh; font-family:'Geist',sans-serif; color:#F0EDE8; }
        .cat-topbar { background:rgba(14,15,17,0.85); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); padding:0 32px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:50; }
        .cat-topbar-title { font-family:'Instrument Serif',serif; font-size:18px; color:#F0EDE8; }
        .cat-topbar-right { display:flex; align-items:center; gap:10px; }
        .btn-gold { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; background:#C9A84C; color:#0E0F11; border-radius:8px; font-family:'Geist',sans-serif; font-size:13px; font-weight:600; border:none; cursor:pointer; text-decoration:none; }
        .btn-gold:hover { background:#D4B05A; }
        .btn-ghost { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; background:rgba(255,255,255,0.05); color:#A8A29E; border-radius:8px; font-family:'Geist',sans-serif; font-size:13px; font-weight:500; border:1px solid rgba(255,255,255,0.08); cursor:pointer; }
        .btn-ghost:hover { background:rgba(255,255,255,0.09); color:#F0EDE8; }
        .cat-content { padding:28px 32px; }

        /* Summary strip */
        .summary-strip { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:rgba(255,255,255,0.06); border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); margin-bottom:28px; }
        .summary-cell { background:#161719; padding:20px 22px; position:relative; }
        .summary-cell-label { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#4A4540; margin-bottom:6px; }
        .summary-cell-value { font-family:'Instrument Serif',serif; font-size:26px; color:#F0EDE8; letter-spacing:-0.5px; line-height:1; }
        .summary-cell-sub { font-size:11px; color:#3D3935; margin-top:5px; font-family:'Geist Mono',monospace; }
        .summary-accent { position:absolute; bottom:0; left:0; right:0; height:2px; }

        /* Seed banner */
        .seed-banner { background:#161719; border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; gap:16px; }
        .seed-text { }
        .seed-title { font-size:14px; font-weight:600; color:#C8C4BF; }
        .seed-sub { font-size:12px; color:#4A4540; margin-top:3px; }
        .seed-pills { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
        .seed-pill { font-size:11px; padding:3px 9px; border-radius:20px; border:1px solid; }
        .seed-pill-exists { background:rgba(107,165,131,0.08); border-color:rgba(107,165,131,0.2); color:#6BA583; }
        .seed-pill-missing { background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.08); color:#4A4540; }

        /* Add form */
        .add-form { background:#161719; border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:20px; margin-bottom:20px; }
        .add-form-title { font-size:13px; font-weight:600; color:#C9A84C; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:16px; }
        .add-form-grid { display:grid; grid-template-columns:1fr auto auto auto auto auto; gap:10px; align-items:end; }
        .form-field { display:flex; flex-direction:column; gap:5px; }
        .form-label { font-size:10px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:#4A4540; }
        .form-input { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:9px 12px; font-family:'Geist',sans-serif; font-size:13px; color:#F0EDE8; outline:none; transition:border-color 0.15s; width:100%; }
        .form-input:focus { border-color:rgba(201,168,76,0.4); }
        .form-input::placeholder { color:#3D3935; }
        .icon-picker { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
        .icon-opt { width:32px; height:32px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; font-size:15px; cursor:pointer; transition:all 0.15s; }
        .icon-opt:hover { background:rgba(255,255,255,0.08); }
        .icon-opt.selected { border-color:rgba(201,168,76,0.5); background:rgba(201,168,76,0.1); }
        .form-error { font-size:12px; color:#E07B6A; margin-top:10px; }
        .grocery-toggle { display:flex; align-items:center; gap:8px; font-size:13px; color:#7A7570; cursor:pointer; padding:9px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03); white-space:nowrap; }
        .grocery-toggle input { accent-color:#C9A84C; width:14px; height:14px; }

        /* Category grid */
        .cat-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; }
        .cat-card { background:#161719; border:1px solid rgba(255,255,255,0.06); border-radius:16px; overflow:hidden; transition:border-color 0.2s; position:relative; }
        .cat-card:hover { border-color:rgba(255,255,255,0.12); }
        .cat-card-over { border-color:rgba(224,123,106,0.3) !important; }
        .cat-card-top { height:3px; }
        .cat-card-body { padding:16px 18px; }
        .cat-card-header { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .cat-card-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
        .cat-card-name { font-size:15px; font-weight:600; color:#D4D0CB; flex:1; }
        .cat-card-grocery { font-size:10px; padding:2px 7px; border-radius:20px; background:rgba(107,165,131,0.12); color:#6BA583; border:1px solid rgba(107,165,131,0.2); font-weight:600; letter-spacing:0.3px; }
        .cat-card-amounts { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
        .cat-card-spent { font-family:'Instrument Serif',serif; font-size:24px; color:#F0EDE8; letter-spacing:-0.5px; }
        .cat-card-budget { font-family:'Geist Mono',monospace; font-size:12px; color:#3D3935; }
        .cat-track { height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; margin-bottom:12px; }
        .cat-fill { height:100%; border-radius:2px; transition:width 0.6s ease; }
        .cat-status-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .cat-status { font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; letter-spacing:0.3px; text-transform:uppercase; }
        .status-ok { background:rgba(107,165,131,0.1); color:#6BA583; }
        .status-warn { background:rgba(232,160,32,0.1); color:#E8A020; }
        .status-over { background:rgba(224,123,106,0.1); color:#E07B6A; }
        .status-none { background:rgba(255,255,255,0.05); color:#4A4540; }
        .cat-pct { font-family:'Geist Mono',monospace; font-size:11px; color:#4A4540; }
        .cat-edit-row { display:flex; gap:8px; }
        .cat-edit-input { flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:7px 10px; font-family:'Geist Mono',monospace; font-size:13px; color:#F0EDE8; outline:none; }
        .cat-edit-input:focus { border-color:rgba(201,168,76,0.4); }
        .cat-edit-input::placeholder { color:#3D3935; }
        .cat-save-btn { padding:7px 12px; background:#C9A84C; color:#0E0F11; border-radius:8px; font-size:12px; font-weight:700; border:none; cursor:pointer; font-family:'Geist',sans-serif; white-space:nowrap; }
        .cat-save-btn:hover { background:#D4B05A; }
        .cat-cancel-btn { padding:7px 10px; background:rgba(255,255,255,0.05); color:#6B6560; border-radius:8px; font-size:12px; border:1px solid rgba(255,255,255,0.08); cursor:pointer; font-family:'Geist',sans-serif; }
        .cat-action-row { display:flex; gap:6px; }
        .cat-edit-trigger { flex:1; padding:7px 12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:8px; font-size:12px; color:#6B6560; cursor:pointer; font-family:'Geist',sans-serif; text-align:left; transition:all 0.15s; }
        .cat-edit-trigger:hover { background:rgba(255,255,255,0.08); color:#C8C4BF; }
        .cat-del-btn { padding:7px 10px; background:rgba(224,123,106,0.06); border:1px solid rgba(224,123,106,0.15); border-radius:8px; font-size:12px; color:#E07B6A; cursor:pointer; font-family:'Geist',sans-serif; transition:all 0.15s; }
        .cat-del-btn:hover { background:rgba(224,123,106,0.12); }
        .no-limit-hint { font-size:11px; color:#3D3935; font-style:italic; }

        /* Toast */
        .toast { position:fixed; bottom:28px; right:28px; background:#1E1F22; border:1px solid rgba(255,255,255,0.1); color:#F0EDE8; padding:11px 18px; border-radius:10px; font-size:13px; font-weight:500; box-shadow:0 8px 32px rgba(0,0,0,0.4); z-index:9999; animation:toastIn 0.2s ease; }
        @keyframes toastIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        /* Month badge */
        .month-badge { font-size:12px; color:#4A4540; font-family:'Geist Mono',monospace; }
      `}</style>

      <div className="cat-page">
        {/* Topbar */}
        <div className="cat-topbar">
          <span className="cat-topbar-title">Budget Categories</span>
          <div className="cat-topbar-right">
            <span className="month-badge">{selectedMonth}</span>
            <button className="btn-ghost" onClick={() => setShowForm(f => !f)}>
              {showForm ? '✕ Cancel' : '＋ New Category'}
            </button>
            {missingDefaults.length > 0 && (
              <button className="btn-gold" onClick={handleSeedDefaults} disabled={seedLoading}>
                {seedLoading ? 'Adding…' : `＋ ${missingDefaults.length} defaults`}
              </button>
            )}
          </div>
        </div>

        <div className="cat-content">
          {/* Summary */}
          <div className="summary-strip">
            <div className="summary-cell">
              <div className="summary-cell-label">Total Budgeted</div>
              <div className="summary-cell-value">{formatCurrency(totalBudgeted)}</div>
              <div className="summary-cell-sub">across {categories.filter(c => c.budget_limit).length} categories</div>
              <div className="summary-accent" style={{ background: '#C9A84C' }} />
            </div>
            <div className="summary-cell">
              <div className="summary-cell-label">Spent This Month</div>
              <div className="summary-cell-value">{formatCurrency(totalSpent)}</div>
              <div className="summary-cell-sub">{totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0}% of budget</div>
              <div className="summary-accent" style={{ background: '#E07B6A' }} />
            </div>
            <div className="summary-cell">
              <div className="summary-cell-label">Over Budget</div>
              <div className="summary-cell-value">{overBudgetCount}</div>
              <div className="summary-cell-sub">{overBudgetCount === 0 ? 'all on track' : `categor${overBudgetCount === 1 ? 'y' : 'ies'} exceeded`}</div>
              <div className="summary-accent" style={{ background: overBudgetCount > 0 ? '#E07B6A' : '#6BA583' }} />
            </div>
          </div>

          {/* Add form */}
          {showForm && (
            <div className="add-form">
              <div className="add-form-title">New Category</div>
              <form onSubmit={handleAddCategory}>
                <div className="add-form-grid">
                  <div className="form-field">
                    <label className="form-label">Name</label>
                    <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pet Care" required />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Budget ($)</label>
                    <input className="form-input" value={budgetLimit} onChange={e => setBudgetLimit(e.target.value)} placeholder="No limit" type="number" min="0" step="0.01" style={{ width: 110 }} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Color</label>
                    <input type="color" className="form-input" value={color} onChange={e => setColor(e.target.value)} style={{ width: 60, height: 38, padding: 4, cursor: 'pointer' }} />
                  </div>
                  <div className="form-field">
                    <label className="form-label">&nbsp;</label>
                    <label className="grocery-toggle">
                      <input type="checkbox" checked={isGrocery} onChange={e => setIsGrocery(e.target.checked)} />
                      Grocery
                    </label>
                  </div>
                  <div className="form-field" style={{ alignSelf: 'end' }}>
                    <button type="submit" className="btn-gold" disabled={formLoading} style={{ height: 38 }}>
                      {formLoading ? 'Saving…' : 'Add'}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="form-label" style={{ marginTop: 14, marginBottom: 8 }}>Icon</div>
                  <div className="icon-picker">
                    {ICON_PICKS.map(i => (
                      <button key={i} type="button" className={`icon-opt${icon === i ? ' selected' : ''}`} onClick={() => setIcon(i)}>{i}</button>
                    ))}
                  </div>
                </div>
                {formError && <div className="form-error">{formError}</div>}
              </form>
            </div>
          )}

          {/* Grid */}
          {categories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#3D3935' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>No categories yet</div>
              <div style={{ fontSize: 13 }}>Add defaults above or create your own</div>
            </div>
          ) : (
            <div className="cat-grid">
              {sorted.map(cat => {
                const spent = spendingByCat[cat.id] ?? 0;
                const limit = cat.budget_limit ?? 0;
                const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
                const status = limit > 0 ? getBudgetStatus(spent, limit) : 'none';
                const fillColor = status === 'over' ? '#E07B6A' : status === 'warning' ? '#E8A020' : status === 'ok' ? '#6BA583' : cat.color;
                const isOver = limit > 0 && spent > limit;
                const isEditing = editingId === cat.id;

                return (
                  <div key={cat.id} className={`cat-card${isOver ? ' cat-card-over' : ''}`}>
                    <div className="cat-card-top" style={{ background: cat.color }} />
                    <div className="cat-card-body">
                      <div className="cat-card-header">
                        <div className="cat-card-icon" style={{ background: cat.color + '22' }}>{cat.icon}</div>
                        <span className="cat-card-name">{cat.name}</span>
                        {cat.is_grocery && <span className="cat-card-grocery">GROCERY</span>}
                      </div>

                      <div className="cat-card-amounts">
                        <span className="cat-card-spent">{formatCurrency(spent)}</span>
                        <span className="cat-card-budget">
                          {limit > 0 ? `of ${formatCurrency(limit)}` : 'no limit set'}
                        </span>
                      </div>

                      {limit > 0 && (
                        <div className="cat-track">
                          <div className="cat-fill" style={{ width: `${pct}%`, background: fillColor }} />
                        </div>
                      )}

                      <div className="cat-status-row">
                        {status === 'over'    && <span className="cat-status status-over">Over budget</span>}
                        {status === 'warning' && <span className="cat-status status-warn">Near limit</span>}
                        {status === 'ok'      && <span className="cat-status status-ok">On track</span>}
                        {status === 'none'    && <span className="no-limit-hint">No budget limit</span>}
                        {limit > 0 && <span className="cat-pct">{Math.round(pct)}%</span>}
                      </div>

                      {isEditing ? (
                        <div className="cat-edit-row">
                          <input
                            autoFocus
                            className="cat-edit-input"
                            value={editBudget}
                            onChange={e => setEditBudget(e.target.value)}
                            placeholder="Monthly limit"
                            type="number" min="0" step="0.01"
                            onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat); if (e.key === 'Escape') setEditingId(null); }}
                          />
                          <button className="cat-save-btn" onClick={() => saveBudget(cat)} disabled={savingId === cat.id}>
                            {savingId === cat.id ? '…' : 'Save'}
                          </button>
                          <button className="cat-cancel-btn" onClick={() => setEditingId(null)}>✕</button>
                        </div>
                      ) : (
                        <div className="cat-action-row">
                          <button className="cat-edit-trigger" onClick={() => startEdit(cat)}>
                            ✏️ {limit > 0 ? `Edit limit — ${formatCurrency(limit)}/mo` : 'Set budget limit'}
                          </button>
                          <button className="cat-del-btn" onClick={() => deleteCategory(cat.id)}>🗑</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}