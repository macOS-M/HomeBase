import type {
  Balance,
  SmartSettlement,
  Expense,
  ExpenseSplit,
  Member,
} from '@homebase/types';

// ─── Settlement Calculator ────────────────────────────────────────────────────
// Minimises the number of transactions needed to settle all balances.
// Uses a greedy creditor/debtor matching algorithm.

export function calculateSmartSettlements(
  balances: Balance[]
): SmartSettlement[] {
  // Build a net balance map: positive = owed money, negative = owes money
  const net: Record<string, number> = {};

  for (const { from_member_id, to_member_id, amount } of balances) {
    net[from_member_id] = (net[from_member_id] ?? 0) - amount;
    net[to_member_id] = (net[to_member_id] ?? 0) + amount;
  }

  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amount: -v }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amount: v }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: SmartSettlement[] = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amount = Math.min(debtor.amount, creditor.amount);

    settlements.push({
      from_member_id: debtor.id,
      to_member_id: creditor.id,
      amount: Math.round(amount * 100) / 100,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) d++;
    if (creditor.amount < 0.01) c++;
  }

  return settlements;
}

// ─── Split Calculator ─────────────────────────────────────────────────────────

export function calculateEqualSplits(
  totalAmount: number,
  memberIds: string[]
): Omit<ExpenseSplit, 'is_settled'>[] {
  const count = memberIds.length;
  const base = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - base * count) * 100) / 100;

  return memberIds.map((member_id, i) => ({
    member_id,
    amount: i === 0 ? base + remainder : base, // first member absorbs rounding
    percentage: Math.round(100 / count),
  }));
}

export function calculatePercentageSplits(
  totalAmount: number,
  splits: { member_id: string; percentage: number }[]
): Omit<ExpenseSplit, 'is_settled'>[] {
  return splits.map(({ member_id, percentage }) => ({
    member_id,
    amount: Math.round((totalAmount * percentage) / 100 * 100) / 100,
    percentage,
  }));
}

// ─── Balance Aggregator ───────────────────────────────────────────────────────
// Takes all unsettled expenses and returns net balances between members.

export function aggregateBalances(expenses: Expense[]): Balance[] {
  const net: Record<string, Record<string, number>> = {};

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.is_settled) continue;
      if (split.member_id === expense.paid_by) continue;

      const from = split.member_id;
      const to = expense.paid_by;

      if (!net[from]) net[from] = {};
      net[from][to] = (net[from][to] ?? 0) + split.amount;
    }
  }

  const balances: Balance[] = [];

  for (const [from, tos] of Object.entries(net)) {
    for (const [to, amount] of Object.entries(tos)) {
      if (amount > 0.01) {
        balances.push({
          from_member_id: from,
          to_member_id: to,
          amount: Math.round(amount * 100) / 100,
        });
      }
    }
  }

  return balances;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

export function getDaysUntilDue(dueDateStr: string): number {
  const due = new Date(dueDateStr);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getBudgetStatus(
  spent: number,
  budget: number
): 'ok' | 'warning' | 'over' {
  const pct = spent / budget;
  if (pct >= 1) return 'over';
  if (pct >= 0.85) return 'warning';
  return 'ok';
}

// ─── Invite Code ──────────────────────────────────────────────────────────────

export function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─── Member Helpers ───────────────────────────────────────────────────────────

export function getMemberInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getMemberById(members: Member[], id: string): Member | undefined {
  return members.find((m) => m.id === id);
}
