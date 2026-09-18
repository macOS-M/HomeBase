import type {
  Balance,
  SmartSettlement,
  Expense,
  ExpenseSplit,
  Member,
} from '@homebase/types';

// ─── Budget-cycle dates ─────────────────────────────────────────────────────
// A selected cycle is identified by the month in which it begins. For example,
// `2026-09` with a start day of 15 covers 15 Sep through 14 Oct.

function localDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMonthKey(month: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('Budget cycle must be a YYYY-MM value.');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error('Budget cycle month is invalid.');
  return { year, monthIndex };
}

export function getBudgetCycleRange(month: string, cycleStartDay = 1) {
  const { year, monthIndex } = parseMonthKey(month);
  const startDay = Math.max(1, Math.min(28, Math.trunc(cycleStartDay)));
  const startDate = localDateKey(year, monthIndex, startDay);
  const nextStart = new Date(year, monthIndex + 1, startDay);
  const endExclusive = localDateKey(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate());
  const endInclusiveDate = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
  const endDate = localDateKey(endInclusiveDate.getFullYear(), endInclusiveDate.getMonth(), endInclusiveDate.getDate());

  return { startDate, endDate, endExclusive };
}

export function getBudgetCycleMonth(date: Date = new Date(), cycleStartDay = 1): string {
  const startDay = Math.max(1, Math.min(28, Math.trunc(cycleStartDay)));
  const cycleDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (cycleDate.getDate() < startDay) cycleDate.setMonth(cycleDate.getMonth() - 1);
  return `${cycleDate.getFullYear()}-${String(cycleDate.getMonth() + 1).padStart(2, '0')}`;
}

export function isDateInBudgetCycle(date: string | null | undefined, month: string, cycleStartDay = 1): boolean {
  if (!date) return false;
  const { startDate, endExclusive } = getBudgetCycleRange(month, cycleStartDay);
  return date >= startDate && date < endExclusive;
}

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
  if (count === 0) {
    throw new Error('At least one member is required to split an expense.');
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('Expense total must be greater than zero.');
  }
  const base = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - base * count) * 100) / 100;

  return memberIds.map((member_id, i) => ({
    member_id,
    amount: i === 0 ? base + remainder : base, // first member absorbs rounding
    // Keep the stored display percentages internally consistent with the cents
    // that are actually owed. This also makes three-way equal splits total 100.
    percentage: Math.round(((i === 0 ? base + remainder : base) / totalAmount) * 10000) / 100,
  }));
}

export function calculatePercentageSplits(
  totalAmount: number,
  splits: { member_id: string; percentage: number }[]
): Omit<ExpenseSplit, 'is_settled'>[] {
  if (splits.length === 0) {
    throw new Error('At least one member is required to split an expense.');
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('Expense total must be greater than zero.');
  }

  const percentageTotal = splits.reduce((sum, split) => sum + split.percentage, 0);
  if (!Number.isFinite(percentageTotal) || Math.abs(percentageTotal - 100) > 0.01) {
    throw new Error('Expense shares must add up to 100%.');
  }

  const calculated = splits.map(({ member_id, percentage }) => ({
    member_id,
    amount: Math.round((totalAmount * percentage) / 100 * 100) / 100,
    percentage,
  }));

  // Do not lose (or invent) a cent due to independent rounding.
  const total = calculated.reduce((sum, split) => sum + split.amount, 0);
  const delta = Math.round((totalAmount - total) * 100) / 100;
  calculated[0].amount = Math.round((calculated[0].amount + delta) * 100) / 100;
  return calculated;
}

// ─── Balance Aggregator ───────────────────────────────────────────────────────
// Takes all unsettled expenses and returns net balances between members.

export function aggregateBalances(
  expenses: Expense[],
  settlements: { from_member_id: string; to_member_id: string; amount: number; method?: string }[] = []
): Balance[] {
  // Work from member net positions rather than pairs of source expenses. This
  // permits a valid net settlement (A pays C to settle A→B and B→C) while
  // retaining every expense as an immutable source record.
  const net: Record<string, number> = {};

  for (const expense of expenses) {
    if (expense.voided_at) continue;
    for (const split of expense.splits) {
      if (split.is_settled) continue;
      if (split.member_id === expense.paid_by) continue;

      net[split.member_id] = (net[split.member_id] ?? 0) - split.amount;
      net[expense.paid_by] = (net[expense.paid_by] ?? 0) + split.amount;
    }
  }

  for (const settlement of settlements) {
    if (settlement.method !== 'net_settlement') continue;
    net[settlement.from_member_id] = (net[settlement.from_member_id] ?? 0) + settlement.amount;
    net[settlement.to_member_id] = (net[settlement.to_member_id] ?? 0) - settlement.amount;
  }

  return calculateSmartSettlements(
    Object.entries(net)
      .filter(([, amount]) => Math.abs(amount) >= 0.01)
      .flatMap(([memberId, amount]) =>
        amount < 0
          ? [{ from_member_id: memberId, to_member_id: '__net__', amount: -amount }]
          : [{ from_member_id: '__net__', to_member_id: memberId, amount }]
      )
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ─── Currency Conversion ─────────────────────────────────────────────────────

export const COMMON_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
] as const;

export function getCurrencyLabel(code: string): string {
  const currency = COMMON_CURRENCIES.find((item) => item.code === code.toUpperCase());
  if (!currency) return code.toUpperCase();
  return `${currency.code} ${currency.symbol}`;
}

const FX_TTL_MS = 30 * 60 * 1000;
const fxCache = new Map<string, { rate: number; expiresAt: number }>();

function fxKey(base: string, quote: string) {
  return `${base}->${quote}`;
}

function getExchangerateHostAccessKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_EXCHANGERATE_HOST_ACCESS_KEY ||
    process.env.EXPO_PUBLIC_EXCHANGERATE_HOST_ACCESS_KEY ||
    process.env.EXCHANGERATE_HOST_ACCESS_KEY
  );
}

async function fetchRatesFromExchangerateHost(base: string, symbols: string[]) {
  const accessKey = getExchangerateHostAccessKey();
  const query = new URLSearchParams({
    base,
    symbols: symbols.join(','),
  });

  if (accessKey) {
    query.set('access_key', accessKey);
  }

  const response = await fetch(`https://api.exchangerate.host/latest?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Currency conversion failed (${response.status}).`);
  }

  const payload = await response.json();
  const rates = payload?.rates as Record<string, number> | undefined;

  if (payload?.success === false || !rates || typeof rates !== 'object') {
    const errorType = payload?.error?.type as string | undefined;
    const errorCode = payload?.error?.code as number | undefined;
    const isAccessKeyProblem = errorType === 'missing_access_key' || errorCode === 101;
    if (!isAccessKeyProblem) {
      throw new Error(payload?.error?.info ?? 'Currency conversion failed: invalid response.');
    }
    return null;
  }

  return rates;
}

async function fetchRatesFromOpenERApi(base: string) {
  const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
  if (!response.ok) {
    throw new Error(`Currency conversion failed (${response.status}).`);
  }

  const payload = await response.json();
  const rates = payload?.rates as Record<string, number> | undefined;
  if (!rates || typeof rates !== 'object') {
    throw new Error('Currency conversion failed: invalid fallback response.');
  }

  return rates;
}

export async function getExchangeRates(baseCurrency: string, quoteCurrencies: string[]): Promise<Record<string, number>> {
  const base = baseCurrency.toUpperCase();
  const quotes = Array.from(new Set(quoteCurrencies.map((c) => c.toUpperCase()).filter((c) => c !== base)));

  const now = Date.now();
  const rates: Record<string, number> = { [base]: 1 };
  const missing: string[] = [];

  for (const quote of quotes) {
    const cached = fxCache.get(fxKey(base, quote));
    if (cached && cached.expiresAt > now) {
      rates[quote] = cached.rate;
      continue;
    }
    missing.push(quote);
  }

  if (missing.length > 0) {
    const fetchedRates = (await fetchRatesFromExchangerateHost(base, missing)) ?? (await fetchRatesFromOpenERApi(base));

    for (const quote of missing) {
      const rate = Number(fetchedRates[quote]);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`Currency conversion rate not available for ${base}/${quote}.`);
      }
      rates[quote] = rate;
      fxCache.set(fxKey(base, quote), { rate, expiresAt: now + FX_TTL_MS });
    }
  }

  return rates;
}

export async function convertCurrency(amount: number, fromCurrency: string, toCurrency: string) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return { convertedAmount: Math.round(amount * 100) / 100, rate: 1 };
  }

  const rates = await getExchangeRates(from, [to]);
  const rate = rates[to];
  const convertedAmount = Math.round(amount * rate * 100) / 100;

  return { convertedAmount, rate };
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
