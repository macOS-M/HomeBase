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
    <>
      <style suppressHydrationWarning>{`
        .wallet-root { flex: 1; background: #0E0F11; min-height: 100vh; color: #F0EDE8; }
        .wallet-topbar { background: rgba(14,15,17,0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 40; }
        .wallet-title { font-family: 'Instrument Serif', serif; font-size: 18px; color: #F0EDE8; }
        .wallet-pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.2); border-radius: 20px; padding: 4px 12px; font-size: 12px; color: #C9A84C; font-family: 'Geist Mono', monospace; font-weight: 500; }
        .wallet-content { padding: 28px 32px; display: grid; grid-template-columns: 1fr; gap: 20px; }
        .wallet-panel { background: #161719; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
        .wallet-head { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .wallet-head-title { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #C9A84C; }
        .wallet-head-sub { font-family: 'Geist Mono', monospace; font-size: 11px; color: #4A4540; }
        .wallet-form { padding: 18px 20px; display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .wallet-input, .wallet-select { width: 100%; background: #1f2022; color: #F0EDE8; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 9px 11px; font-size: 13px; outline: none; }
        .wallet-input::placeholder { color: #6B6560; }
        .wallet-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 14px; background: #C9A84C; color: #0E0F11; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
        .wallet-btn:hover { background: #D4B05A; }
        .wallet-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .wallet-error { margin-top: 8px; margin-left: 20px; margin-right: 20px; color: #E07B6A; font-size: 12px; }
        .wallet-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .wallet-row:last-child { border-bottom: none; }
        .wallet-desc { font-size: 13px; font-weight: 500; color: #D4D0CB; }
        .wallet-date { margin-top: 2px; font-size: 11px; color: #3D3935; }
        .wallet-amount { font-family: 'Geist Mono', monospace; font-size: 14px; font-weight: 600; }
        .wallet-amount-plus { color: #6BA583; }
        .wallet-amount-minus { color: #E07B6A; }
        .wallet-empty { text-align: center; padding: 28px 16px; font-size: 13px; color: #3D3935; }

        @media (max-width: 1024px) {
          .wallet-form { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 768px) {
          .wallet-topbar { padding: 12px 14px; height: auto; min-height: 56px; }
          .wallet-content { padding: 14px; }
          .wallet-form { grid-template-columns: 1fr; padding-left: 14px; padding-right: 14px; }
          .wallet-head, .wallet-row { padding-left: 14px; padding-right: 14px; }
          .wallet-error { margin-left: 14px; margin-right: 14px; }
        }
      `}</style>

      <section className="wallet-root">
        <div className="wallet-topbar">
          <span className="wallet-title">Wallet</span>
          <span className="wallet-pill">💰 {formatCurrency(balance)}</span>
        </div>

        <div className="wallet-content">
          <div className="wallet-panel">
            <div className="wallet-head">
              <span className="wallet-head-title">Add transaction</span>
              <span className="wallet-head-sub">Shared household cashflow</span>
            </div>

            <form onSubmit={onSubmit} className="wallet-form">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'deposit' | 'withdraw')}
                className="wallet-select"
              >
                <option value="deposit">Deposit</option>
                <option value="withdraw">Withdraw</option>
              </select>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                className="wallet-input"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                className="wallet-input"
              />
              <button type="submit" disabled={addFunds.isPending} className="wallet-btn">
                {addFunds.isPending ? 'Saving...' : 'Add'}
              </button>
            </form>
            {error && <p className="wallet-error">{error}</p>}
          </div>

          <div className="wallet-panel">
            <div className="wallet-head">
              <span className="wallet-head-title">Transactions</span>
              <span className="wallet-head-sub">{transactions.length} total</span>
            </div>

            {transactions.length === 0 ? (
              <p className="wallet-empty">No wallet transactions yet.</p>
            ) : (
              <ul>
                {transactions.map((tx) => (
                  <li key={tx.id} className="wallet-row">
                    <div>
                      <p className="wallet-desc">{tx.description}</p>
                      <p className="wallet-date">{new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className={`wallet-amount ${tx.amount >= 0 ? 'wallet-amount-plus' : 'wallet-amount-minus'}`}>
                      {formatCurrency(tx.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
