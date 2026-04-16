'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  useGroceryItems,
  useCreateGroceryItem,
  useToggleGroceryItemDone,
  useDeleteGroceryItem,
  useClearDoneGroceryItems,
  useCreateExpense,
  useMembers,
} from '@homebase/api';
import { COMMON_CURRENCIES, calculateEqualSplits, calculatePercentageSplits } from '@homebase/utils';
import type { GroceryItem, GroceryPriority, SplitType } from '@homebase/types';

type Priority = GroceryPriority;

const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-[rgba(107,165,131,0.12)] text-[#6BA583] border-[rgba(107,165,131,0.25)]',
  medium: 'bg-[rgba(232,160,32,0.12)] text-[#E8A020] border-[rgba(232,160,32,0.25)]',
  high: 'bg-[rgba(224,123,106,0.12)] text-[#E07B6A] border-[rgba(224,123,106,0.25)]',
};

function getLocalISODate() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
}

export function GroceryListClient({
  householdId,
  suggestions,
  groceryCategoryId,
  defaultSplitType,
  currentMemberId,
}: {
  householdId: string;
  suggestions: string[];
  groceryCategoryId?: string;
  defaultSplitType: 'equal' | 'percentage';
  currentMemberId: string;
}) {
  const supabase = createClient();
  const { data: items = [], isLoading, error } = useGroceryItems(supabase, householdId);
  const { data: members = [] } = useMembers(supabase, householdId);
  const createItem = useCreateGroceryItem(supabase, householdId);
  const createExpense = useCreateExpense(supabase, householdId);
  const toggleItem = useToggleGroceryItemDone(supabase, householdId);
  const deleteItem = useDeleteGroceryItem(supabase, householdId);
  const clearDoneItems = useClearDoneGroceryItems(supabase, householdId);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [actionError, setActionError] = useState('');
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [convertAmount, setConvertAmount] = useState('');
  const [convertPaidBy, setConvertPaidBy] = useState(currentMemberId);
  const [convertCurrencyCode, setConvertCurrencyCode] = useState('USD');

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'done') return items.filter((item) => item.done);
    return items.filter((item) => !item.done);
  }, [items, filter]);

  const openCount = items.filter((item) => !item.done).length;
  const doneCount = items.length - openCount;
  const doneItems = items.filter((item) => item.done);

  function buildSplits(totalAmount: number) {
    const splitType: SplitType = defaultSplitType === 'percentage' ? 'percentage' : 'equal';
    if (members.length === 0) {
      return { splitType: 'equal' as const, splits: [] as ReturnType<typeof calculateEqualSplits> };
    }
    if (splitType === 'percentage') {
      const totalBudget = members.reduce((sum, m) => sum + Math.max(0, m.monthly_budget ?? 0), 0);
      if (totalBudget > 0) {
        return {
          splitType,
          splits: calculatePercentageSplits(
            totalAmount,
            members.map((m) => ({
              member_id: m.id,
              percentage: (Math.max(0, m.monthly_budget ?? 0) / totalBudget) * 100,
            }))
          ),
        };
      }
    }
    return {
      splitType: 'equal' as const,
      splits: calculateEqualSplits(totalAmount, members.map((m) => m.id)),
    };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setActionError('');
    try {
      await createItem.mutateAsync({
        name: trimmed,
        quantity: quantity.trim() || undefined,
        notes: notes.trim() || undefined,
        priority,
      });

      setName('');
      setQuantity('');
      setNotes('');
      setPriority('medium');
    } catch (err: any) {
      setActionError(err?.message ?? 'Unable to add grocery item.');
    }
  }

  function toggleDone(item: GroceryItem) {
    setActionError('');
    toggleItem.mutate(
      { itemId: item.id, done: !item.done },
      { onError: (err: any) => setActionError(err?.message ?? 'Unable to update item.') }
    );
  }

  function removeItem(id: string) {
    setActionError('');
    deleteItem.mutate(id, {
      onError: (err: any) => setActionError(err?.message ?? 'Unable to remove item.'),
    });
  }

  function clearDone() {
    setActionError('');
    clearDoneItems.mutate(undefined, {
      onError: (err: any) => setActionError(err?.message ?? 'Unable to clear bought items.'),
    });
  }

  function addSuggestion(suggestion: string) {
    const trimmed = suggestion.trim();
    if (!trimmed) return;
    if (items.some((item) => item.name.toLowerCase() === trimmed.toLowerCase() && !item.done)) {
      return;
    }
    setActionError('');
    createItem.mutate(
      { name: trimmed, priority: 'medium' },
      { onError: (err: any) => setActionError(err?.message ?? 'Unable to add suggestion.') }
    );
  }

  async function convertBoughtToExpense() {
    setActionError('');
    if (!groceryCategoryId) {
      setActionError('Missing grocery category. Mark one category as grocery first.');
      return;
    }
    if (doneItems.length === 0) {
      setActionError('No bought items to convert.');
      return;
    }
    const parsedAmount = Number(convertAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError('Enter a valid total amount spent.');
      return;
    }
    if (!convertPaidBy) {
      setActionError('Pick who paid.');
      return;
    }

    const itemSummary = doneItems
      .map((item) => (item.quantity ? `${item.name} (${item.quantity})` : item.name))
      .join(', ')
      .slice(0, 4000);

    const receiptItems = doneItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    }));

    const { splitType, splits } = buildSplits(parsedAmount);
    if (splits.length === 0) {
      setActionError('No members available for splits.');
      return;
    }

    try {
      await createExpense.mutateAsync({
        name: `Grocery run (${doneItems.length} item${doneItems.length === 1 ? '' : 's'})`,
        amount: parsedAmount,
        currency_code: convertCurrencyCode,
        category_id: groceryCategoryId,
        paid_by: convertPaidBy,
        split_type: splitType,
        splits,
        date: getLocalISODate(),
        receipt_items: receiptItems,
        notes: `Bought items: ${itemSummary}`,
      });
      await clearDoneItems.mutateAsync();
      setConvertAmount('');
      setShowConvertForm(false);
    } catch (err: any) {
      setActionError(err?.message ?? 'Unable to convert bought items into expense.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#161719] rounded-2xl border border-[rgba(255,255,255,0.06)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[#F0EDE8]">Need to buy</h2>
          <div className="text-xs text-[#6B6560]">
            {openCount} open · {doneCount} bought
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add item"
            className="md:col-span-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] placeholder:text-[#6B6560] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
            required
          />
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty (optional)"
            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] placeholder:text-[#6B6560] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1f2022] text-[#F0EDE8] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="md:col-span-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] placeholder:text-[#6B6560] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
          />
          <button
            type="submit"
            disabled={createItem.isPending}
            className="rounded-lg bg-[#C9A84C] text-[#0E0F11] text-sm font-semibold px-3 py-2 hover:bg-[#D4B05A]"
          >
            {createItem.isPending ? 'Adding…' : 'Add to list'}
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-[#6B6560]">Quick add:</span>
            {suggestions.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addSuggestion(suggestion)}
                className="text-xs border border-[rgba(255,255,255,0.1)] rounded-full px-3 py-1 text-[#C8C4BF] hover:bg-[rgba(255,255,255,0.07)]"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#161719] rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="p-3 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
          <div className="flex gap-2">
            {(['open', 'done', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`text-xs rounded-full px-3 py-1 border ${
                  filter === value
                    ? 'border-[rgba(201,168,76,0.3)] bg-[rgba(201,168,76,0.12)] text-[#C9A84C]'
                    : 'border-[rgba(255,255,255,0.1)] text-[#6B6560]'
                }`}
              >
                {value === 'open' ? 'Open' : value === 'done' ? 'Bought' : 'All'}
              </button>
            ))}
          </div>
          {doneCount > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowConvertForm((v) => !v)}
                className="text-xs text-[#C9A84C] hover:underline"
              >
                Convert bought → expense
              </button>
              <button
                type="button"
                onClick={clearDone}
                className="text-xs text-[#E07B6A] hover:underline"
              >
                Clear bought
              </button>
            </div>
          )}
        </div>

        {showConvertForm && doneCount > 0 && (
          <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              placeholder="Total spent"
              type="number"
              min="0"
              step="0.01"
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[#F0EDE8] placeholder:text-[#6B6560] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
            />
            <select
              value={convertPaidBy}
              onChange={(e) => setConvertPaidBy(e.target.value)}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1f2022] text-[#F0EDE8] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select
              value={convertCurrencyCode}
              onChange={(e) => setConvertCurrencyCode(e.target.value)}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1f2022] text-[#F0EDE8] px-3 py-2 text-sm outline-none focus:border-[rgba(201,168,76,0.45)]"
            >
              {COMMON_CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>{currency.code} {currency.symbol}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={createExpense.isPending || clearDoneItems.isPending}
              onClick={convertBoughtToExpense}
              className="rounded-lg bg-[#C9A84C] text-[#0E0F11] text-sm font-semibold px-3 py-2 hover:bg-[#D4B05A] disabled:opacity-60"
            >
              {createExpense.isPending || clearDoneItems.isPending ? 'Converting…' : 'Create Grocery Expense'}
            </button>
          </div>
        )}

        {error && (
          <p className="px-4 py-3 text-xs text-[#E07B6A] border-b border-[rgba(255,255,255,0.05)]">
            Unable to load grocery list.
          </p>
        )}

        {actionError && (
          <p className="px-4 py-3 text-xs text-[#E07B6A] border-b border-[rgba(255,255,255,0.05)]">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <p className="p-6 text-sm text-[#6B6560]">Loading list…</p>
        ) : filteredItems.length === 0 ? (
          <p className="p-6 text-sm text-[#6B6560]">No items in this view.</p>
        ) : (
          <ul className="divide-y divide-[rgba(255,255,255,0.04)]">
            {filteredItems.map((item) => (
              <li key={item.id} className="p-4 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleDone(item)}
                  className={`mt-0.5 h-5 w-5 rounded border ${item.done ? 'bg-[#6BA583] border-[#6BA583]' : 'border-[rgba(255,255,255,0.25)]'}`}
                  aria-label={item.done ? 'Mark as not bought' : 'Mark as bought'}
                >
                  {item.done ? <span className="text-white text-xs">✓</span> : null}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-medium ${item.done ? 'line-through text-[#6B6560]' : 'text-[#F0EDE8]'}`}>{item.name}</p>
                    {item.quantity && <span className="text-xs text-[#6B6560]">· {item.quantity}</span>}
                    <span className={`text-[11px] rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[item.priority]}`}>
                      {item.priority}
                    </span>
                  </div>
                  {item.notes && <p className="text-xs text-[#6B6560] mt-1">{item.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-[#E07B6A] hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
