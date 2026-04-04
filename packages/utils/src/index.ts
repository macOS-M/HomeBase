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
