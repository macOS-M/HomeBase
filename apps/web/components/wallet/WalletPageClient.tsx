'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWallet, useAddWalletFunds } from '@homebase/api';
import { formatCurrency } from '@homebase/utils';
import type { Household, Member } from '@homebase/types';

export function WalletPageClient({ household, member }: { household: Household; member: Member }) {
  const supabase = createClient();
  const { data: wallet } = useWallet(supabase, household.id);
  const addFunds = useAddWalletFunds(supabase, household.id);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'deposit' | 'withdraw'>('deposit');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    const signedAmount = type === 'deposit' ? parsed : -parsed;

    try {
      await addFunds.mutateAsync({
        memberId: member.id,
        amount: signedAmount,
        description: description || (type === 'deposit' ? 'Deposit' : 'Withdrawal'),
      });
      setDescription('');
      setAmount('');
      setType('deposit');
    } catch (err: any) {
      setError(err?.message ?? 'Unable to add transaction.');
    }
  }

  const transactions = wallet?.transactions ?? [];
  const balance = wallet?.balance ?? 0;

  return (
    <section className="p-8">
      <h1 className="text-2xl font-semibold text-[#1A1714]">Wallet</h1>
      <p className="text-sm text-[#6B6560] mt-1">Shared household cashflow</p>

      <div className="mt-4 inline-flex px-4 py-2 rounded-lg bg-white border border-[#E8E2D9] text-[#1A1714] font-semibold">
        Balance: {formatCurrency(balance)}
      </div>

      <form onSubmit={onSubmit} className="mt-6 bg-white rounded-xl border border-[#E8E2D9] p-4 grid gap-3 md:grid-cols-4">
        <select value={type} onChange={(e) => setType(e.target.value as 'deposit' | 'withdraw')} className="px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm bg-[#1f2022] text-[#F0EDE8]">
          <option value="deposit">Deposit</option>
          <option value="withdraw">Withdraw</option>
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Amount" className="px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="px-3 py-2 rounded-lg border border-[#E2DDD6] text-sm" />
        <button type="submit" disabled={addFunds.isPending} className="px-4 py-2 rounded-lg bg-[#2D5F3F] text-white text-sm font-medium disabled:opacity-50">
          {addFunds.isPending ? 'Saving...' : 'Add'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[#C84B31]">{error}</p>}

      <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] overflow-hidden">
        {transactions.length === 0 ? (
          <p className="p-6 text-sm text-[#6B6560]">No wallet transactions yet.</p>
        ) : (
          <ul className="divide-y divide-[#EFE9E0]">
            {transactions.map((tx) => (
              <li key={tx.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-[#1A1714]">{tx.description}</p>
                  <p className="text-xs text-[#6B6560]">{new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
                <p className={`font-semibold ${tx.amount >= 0 ? 'text-[#2D5F3F]' : 'text-[#C84B31]'}`}>
                  {formatCurrency(tx.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
