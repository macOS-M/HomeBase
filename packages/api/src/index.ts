import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  aggregateBalances,
  calculateSmartSettlements,
  calculateEqualSplits,
  calculatePercentageSplits,
  convertCurrency,
} from '@homebase/utils';
import type {
  Expense,
  CreateExpenseInput,
  Bill,
  CreateBillInput,
  GroceryItem,
  Category,
  Member,
  Balance,
  SmartSettlement,
  WalletTransaction,
  DashboardData,
} from '@homebase/types';

// The supabase client is injected so both web and mobile can pass their own
// platform-specific instance without this package depending on a specific env.
type SupabaseClient = any;
const HOUSEHOLD_BASE_CURRENCY = 'USD';

function scaleSplitsToTotal(
  splits: { member_id: string; amount: number; percentage?: number }[],
  originalTotal: number,
  convertedTotal: number
) {
  if (splits.length === 0) return splits;
  if (!Number.isFinite(originalTotal) || originalTotal <= 0 || Math.abs(originalTotal - convertedTotal) < 0.005) {
    return splits;
  }

  const ratio = convertedTotal / originalTotal;
  const scaled = splits.map((split) => ({
    ...split,
    amount: Math.round(split.amount * ratio * 100) / 100,
  }));

  const scaledSum = scaled.reduce((sum, split) => sum + split.amount, 0);
  const delta = Math.round((convertedTotal - scaledSum) * 100) / 100;
  if (Math.abs(delta) >= 0.01) {
    scaled[0] = {
      ...scaled[0],
      amount: Math.round((scaled[0].amount + delta) * 100) / 100,
    };
  }

  return scaled;
}

function toLocalISODate(input: Date) {
  const offsetMs = input.getTimezoneOffset() * 60 * 1000;
  return new Date(input.getTime() - offsetMs).toISOString().split('T')[0];
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const queryKeys = {
  dashboard: (householdId: string, month: string) =>
    ['dashboard', householdId, month] as const,
  expensesAll: (householdId: string) =>
    ['expenses-all', householdId] as const,
  expenses: (householdId: string, month: string) =>
    ['expenses', householdId, month] as const,
  expense: (id: string) => ['expense', id] as const,
  categories: (householdId: string) => ['categories', householdId] as const,
  bills: (householdId: string) => ['bills', householdId] as const,
  members: (householdId: string) => ['members', householdId] as const,
  groceryItems: (householdId: string) => ['grocery-items', householdId] as const,
  balances: (householdId: string, month: string) =>
    ['balances', householdId, month] as const,
  wallet: (householdId: string) => ['wallet', householdId] as const,
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export function useExpenses(
  supabase: SupabaseClient,
  householdId: string,
  month: string // 'YYYY-MM'
) {
  return useQuery({
    queryKey: queryKeys.expenses(householdId, month),
    queryFn: async (): Promise<Expense[]> => {
      const startDate = `${month}-01`;
      const start = new Date(`${startDate}T00:00:00`);
      const endDate = toLocalISODate(new Date(start.getFullYear(), start.getMonth() + 1, 0));

      const { data, error } = await supabase
        .from('expenses')
        .select('*, splits:expense_splits(*)')
        .eq('household_id', householdId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

export function useExpensesAll(
  supabase: SupabaseClient,
  householdId: string
) {
  return useQuery({
    queryKey: queryKeys.expensesAll(householdId),
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, splits:expense_splits(*)')
        .eq('household_id', householdId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

export function useCreateExpense(
  supabase: SupabaseClient,
  householdId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateExpenseInput): Promise<Expense> => {
      const { splits, ...expenseData } = input;
      const inputAmount = Number(input.amount);
      const inputCurrency = (input.currency_code ?? HOUSEHOLD_BASE_CURRENCY).toUpperCase();
      const { convertedAmount, rate } = await convertCurrency(
        inputAmount,
        inputCurrency,
        HOUSEHOLD_BASE_CURRENCY
      );

      const scaledSplits = scaleSplitsToTotal(splits, inputAmount, convertedAmount);

      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          ...expenseData,
          amount: convertedAmount,
          original_amount: inputAmount,
          currency_code: inputCurrency,
          fx_rate: rate,
          household_id: householdId,
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      const splitRows = scaledSplits.map((s) => ({
        ...s,
        expense_id: expense.id,
        is_settled: false,
      }));

      const { error: splitError } = await supabase
        .from('expense_splits')
        .insert(splitRows);

      if (splitError) throw splitError;

      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-all', householdId] });
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
    },
  });
}

export function useDeleteExpense(
  supabase: SupabaseClient,
  householdId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-all', householdId] });
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
    },
  });
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function useCategories(supabase: SupabaseClient, householdId: string) {
  return useQuery({
    queryKey: queryKeys.categories(householdId),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('household_id', householdId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export function useBills(supabase: SupabaseClient, householdId: string) {
  return useQuery({
    queryKey: queryKeys.bills(householdId),
    queryFn: async (): Promise<Bill[]> => {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('household_id', householdId)
        .order('due_date');
      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

export function useCreateBill(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBillInput): Promise<Bill> => {
      const inputAmount = Number(input.amount);
      const inputCurrency = (input.currency_code ?? HOUSEHOLD_BASE_CURRENCY).toUpperCase();
      const { convertedAmount, rate } = await convertCurrency(
        inputAmount,
        inputCurrency,
        HOUSEHOLD_BASE_CURRENCY
      );

      const { data, error } = await supabase
        .from('bills')
        .insert({
          ...input,
          amount: convertedAmount,
          original_amount: inputAmount,
          currency_code: inputCurrency,
          fx_rate: rate,
          household_id: householdId,
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
    },
  });
}

export function useDeleteBill(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (billId: string) => {
      const { error } = await supabase
        .from('bills')
        .delete()
        .eq('id', billId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
    },
  });
}

export function useToggleBillStatus(
  supabase: SupabaseClient,
  householdId: string
) {
  const queryClient = useQueryClient();

  function toISODate(input: Date) {
    return input.toISOString().split('T')[0];
  }

  function todayLocalISODate() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
  }

  function daysUntilDueFromToday(dueDate: string) {
    const today = todayLocalISODate();
    const [ty, tm, td] = today.split('-').map(Number);
    const [dy, dm, dd] = dueDate.split('-').map(Number);
    const todayUtc = Date.UTC(ty, tm - 1, td);
    const dueUtc = Date.UTC(dy, dm - 1, dd);
    return Math.ceil((dueUtc - todayUtc) / (1000 * 60 * 60 * 24));
  }

  function addRecurringInterval(dueDate: string, recurring: 'monthly' | 'weekly' | 'yearly' | 'once') {
    const [year, month, day] = dueDate.split('-').map(Number);
    const base = new Date(Date.UTC(year, month - 1, day));

    if (recurring === 'weekly') {
      base.setUTCDate(base.getUTCDate() + 7);
      return toISODate(base);
    }

    if (recurring === 'yearly') {
      const targetYear = base.getUTCFullYear() + 1;
      const targetMonth = base.getUTCMonth();
      const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const targetDay = Math.min(base.getUTCDate(), daysInTargetMonth);
      return toISODate(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
    }

    if (recurring === 'monthly') {
      const targetYear = base.getUTCFullYear();
      const targetMonth = base.getUTCMonth() + 1;
      const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const targetDay = Math.min(base.getUTCDate(), daysInTargetMonth);
      return toISODate(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
    }

    return dueDate;
  }

  async function createBillPaymentExpense(params: {
    bill: {
      id: string;
      name: string;
      amount: number;
      original_amount?: number;
      currency_code?: string;
      fx_rate?: number;
      due_date: string;
    };
  }) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error('You must be signed in to pay bills.');

    const { data: payer, error: payerError } = await supabase
      .from('members')
      .select('id')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .single();

    if (payerError || !payer) {
      throw new Error('Unable to determine who paid this bill.');
    }

    const { data: household, error: householdError } = await supabase
      .from('households')
      .select('default_split_type')
      .eq('id', householdId)
      .single();

    if (householdError || !household) {
      throw new Error('Unable to load household split settings.');
    }

    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('id, monthly_budget')
      .eq('household_id', householdId);

    if (membersError || !members || members.length === 0) {
      throw new Error('Unable to load household members for bill split.');
    }

    const amount = params.bill.amount;
    const memberIds = members.map((m: any) => m.id);
    const splitType = household.default_split_type === 'percentage' ? 'percentage' : 'equal';

    const splits = splitType === 'percentage'
      ? (() => {
          const totalBudget = members.reduce((sum: number, m: any) => sum + Math.max(0, m.monthly_budget ?? 0), 0);
          if (totalBudget <= 0) return calculateEqualSplits(amount, memberIds);
          return calculatePercentageSplits(
            amount,
            members.map((m: any) => ({
              member_id: m.id,
              percentage: (Math.max(0, m.monthly_budget ?? 0) / totalBudget) * 100,
            }))
          );
        })()
      : calculateEqualSplits(amount, memberIds);

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        household_id: householdId,
        name: params.bill.name,
        amount,
        original_amount: params.bill.original_amount ?? amount,
        currency_code: params.bill.currency_code ?? HOUSEHOLD_BASE_CURRENCY,
        fx_rate: params.bill.fx_rate ?? 1,
        source_type: 'bill',
        source_bill_id: params.bill.id,
        category_id: null,
        paid_by: payer.id,
        split_type: splitType,
        date: todayLocalISODate(),
      })
      .select('id')
      .single();

    if (expenseError || !expense) {
      throw expenseError ?? new Error('Unable to create bill expense.');
    }

    const splitRows = splits.map((s) => ({
      expense_id: expense.id,
      member_id: s.member_id,
      amount: s.amount,
      percentage: s.percentage,
      is_settled: false,
    }));

    const { error: splitError } = await supabase
      .from('expense_splits')
      .insert(splitRows);

    if (splitError) {
      await supabase.from('expenses').delete().eq('id', expense.id);
      throw splitError;
    }
  }

  return useMutation({
    mutationFn: async ({
      billId,
      status,
    }: {
      billId: string;
      status: 'paid' | 'pending';
    }) => {
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .select('id, household_id, name, icon, amount, original_amount, currency_code, fx_rate, recurring, due_date, status')
        .eq('id', billId)
        .eq('household_id', householdId)
        .single();

      if (billError) throw billError;

      if (status === 'paid') {
        if (bill.status === 'paid') return;

        if (bill.recurring === 'once') {
          const paidAt = new Date().toISOString();
          const { error } = await supabase
            .from('bills')
            .update({ status: 'paid', paid_at: paidAt })
            .eq('id', billId)
            .eq('household_id', householdId);
          if (error) throw error;

          try {
            await createBillPaymentExpense({ bill });
          } catch (expenseError) {
            await supabase
              .from('bills')
              .update({ status: 'pending', paid_at: null })
              .eq('id', billId)
              .eq('household_id', householdId);
            throw expenseError;
          }

          return;
        }

        const daysUntilDue = daysUntilDueFromToday(bill.due_date);
        if (daysUntilDue > 7) {
          throw new Error('This bill is not due yet. You can pay recurring bills when they are within 7 days of due date.');
        }

        const nextDueDate = addRecurringInterval(bill.due_date, bill.recurring);
        const paidAt = new Date().toISOString();
        const baseCurrency = HOUSEHOLD_BASE_CURRENCY;
        const billOriginalAmount = bill.original_amount ?? bill.amount;
        const billCurrency = (bill.currency_code ?? baseCurrency).toUpperCase();
        const { convertedAmount: nextCycleAmount, rate: nextCycleRate } = await convertCurrency(
          billOriginalAmount,
          billCurrency,
          baseCurrency
        );

        const { error: markPaidError } = await supabase
          .from('bills')
          .update({
            status: 'paid',
            paid_at: paidAt,
          })
          .eq('id', billId)
          .eq('household_id', householdId);

        if (markPaidError) throw markPaidError;

        try {
          await createBillPaymentExpense({ bill });
        } catch (expenseError) {
          await supabase
            .from('bills')
            .update({ status: 'pending', paid_at: null })
            .eq('id', billId)
            .eq('household_id', householdId);
          throw expenseError;
        }

        const { error: createNextError } = await supabase
          .from('bills')
          .insert({
            household_id: householdId,
            name: bill.name,
            icon: bill.icon,
            amount: nextCycleAmount,
            original_amount: billOriginalAmount,
            currency_code: billCurrency,
            fx_rate: nextCycleRate,
            due_date: nextDueDate,
            status: 'pending',
            recurring: bill.recurring,
          });

        if (createNextError) {
          await supabase
            .from('expenses')
            .delete()
            .eq('household_id', householdId)
            .eq('source_type', 'bill')
            .eq('source_bill_id', billId);
          await supabase
            .from('bills')
            .update({ status: 'pending', paid_at: null })
            .eq('id', billId)
            .eq('household_id', householdId);
          throw createNextError;
        }

        return;
      }

      if (bill.status === 'paid' && bill.recurring !== 'once') {
        throw new Error('Recurring paid bills are kept as history and cannot be reopened.');
      }

      if (bill.status === 'paid' && bill.recurring === 'once') {
        await supabase
          .from('expenses')
          .delete()
          .eq('household_id', householdId)
          .eq('source_type', 'bill')
          .eq('source_bill_id', billId);
      }

      const { error } = await supabase
        .from('bills')
        .update({ status: 'pending', paid_at: null })
        .eq('id', billId)
        .eq('household_id', householdId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      queryClient.invalidateQueries({ queryKey: ['expenses-all', householdId] });
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
    },
  });
}

// ─── Grocery List ────────────────────────────────────────────────────────────

export function useGroceryItems(supabase: SupabaseClient, householdId: string) {
  return useQuery({
    queryKey: queryKeys.groceryItems(householdId),
    queryFn: async (): Promise<GroceryItem[]> => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('household_id', householdId)
        .order('done', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

export function useCreateGroceryItem(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      quantity?: string;
      notes?: string;
      priority: 'low' | 'medium' | 'high';
    }) => {
      const { error } = await supabase.from('grocery_items').insert({
        household_id: householdId,
        name: input.name,
        quantity: input.quantity ?? null,
        notes: input.notes ?? null,
        priority: input.priority,
        done: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groceryItems(householdId) });
    },
  });
}

export function useToggleGroceryItemDone(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, done }: { itemId: string; done: boolean }) => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ done, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('household_id', householdId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groceryItems(householdId) });
    },
  });
}

export function useDeleteGroceryItem(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('id', itemId)
        .eq('household_id', householdId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groceryItems(householdId) });
    },
  });
}

export function useClearDoneGroceryItems(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('household_id', householdId)
        .eq('done', true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groceryItems(householdId) });
    },
  });
}

// ─── Members ─────────────────────────────────────────────────────────────────

export function useMembers(supabase: SupabaseClient, householdId: string) {
  return useQuery({
    queryKey: queryKeys.members(householdId),
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('household_id', householdId);
      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export function useBalances(
  supabase: SupabaseClient,
  householdId: string,
  month: string
) {
  const { data: expenses } = useExpenses(supabase, householdId, month);

  return useQuery({
    queryKey: queryKeys.balances(householdId, month),
    queryFn: (): Balance[] => aggregateBalances(expenses ?? []),
    enabled: !!expenses,
  });
}

export function useSmartSettlements(
  supabase: SupabaseClient,
  householdId: string,
  month: string
): SmartSettlement[] {
  const { data: balances } = useBalances(supabase, householdId, month);
  return calculateSmartSettlements(balances ?? []);
}

export function useSettleBalance(
  supabase: SupabaseClient,
  householdId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fromMemberId,
      toMemberId,
      amount,
    }: {
      fromMemberId: string;
      toMemberId: string;
      amount: number;
    }) => {
      // Mark all relevant splits as settled
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id')
        .eq('household_id', householdId)
        .eq('paid_by', toMemberId);

      if (!expenses) return;

      const expenseIds = expenses.map((e: any) => e.id);

      await supabase
        .from('expense_splits')
        .update({ is_settled: true })
        .in('expense_id', expenseIds)
        .eq('member_id', fromMemberId)
        .eq('is_settled', false);

      // Log settlement record
      await supabase.from('settlements').insert({
        household_id: householdId,
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount,
        settled_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
    },
  });
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export function useWallet(supabase: SupabaseClient, householdId: string) {
  return useQuery({
    queryKey: queryKeys.wallet(householdId),
    queryFn: async (): Promise<{
      balance: number;
      transactions: WalletTransaction[];
    }> => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const balance = (data as WalletTransaction[]).reduce(
        (sum, t) => sum + t.amount,
        0
      );

      return { balance, transactions: data };
    },
    enabled: !!householdId,
  });
}

export function useAddWalletFunds(
  supabase: SupabaseClient,
  householdId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      amount,
      description,
    }: {
      memberId: string;
      amount: number;
      description: string;
    }) => {
      const { error } = await supabase.from('wallet_transactions').insert({
        household_id: householdId,
        member_id: memberId,
        amount,
        description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet', householdId] });
    },
  });
}
