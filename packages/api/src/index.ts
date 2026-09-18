import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  aggregateBalances,
  calculateSmartSettlements,
  convertCurrency,
  getBudgetCycleRange,
} from '@homebase/utils';
import type {
  Expense,
  CreateExpenseInput,
  Bill,
  CreateBillInput,
  GroceryItem,
  TodoItem,
  Category,
  Member,
  Balance,
  SmartSettlement,
  Settlement,
  WalletTransaction,
  DashboardData,
} from '@homebase/types';

// The supabase client is injected so both web and mobile can pass their own
// platform-specific instance without this package depending on a specific env.
type SupabaseClient = any;
const DEFAULT_BASE_CURRENCY = 'USD';

async function getHouseholdBaseCurrency(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from('households')
    .select('base_currency')
    .eq('id', householdId)
    .single();
  if (error) throw error;
  return String(data?.base_currency ?? DEFAULT_BASE_CURRENCY).toUpperCase();
}

function validateSplitTotal(
  total: number,
  splits: { member_id: string; amount: number }[]
) {
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('Amount must be greater than zero.');
  }
  if (splits.length === 0) {
    throw new Error('At least one split is required.');
  }
  if (splits.some((split) => !split.member_id || !Number.isFinite(split.amount) || split.amount < 0)) {
    throw new Error('Each split must have a member and a non-negative amount.');
  }
  const splitTotal = splits.reduce((sum, split) => sum + split.amount, 0);
  if (Math.abs(splitTotal - total) > 0.01) {
    throw new Error('Expense splits must total the expense amount.');
  }
}

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

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const queryKeys = {
  dashboard: (householdId: string, month: string) =>
    ['dashboard', householdId, month] as const,
  expensesAll: (householdId: string) =>
    ['expenses-all', householdId] as const,
  expenses: (householdId: string, month: string, cycleStartDay = 1) =>
    ['expenses', householdId, month, cycleStartDay] as const,
  expense: (id: string) => ['expense', id] as const,
  categories: (householdId: string) => ['categories', householdId] as const,
  bills: (householdId: string) => ['bills', householdId] as const,
  members: (householdId: string) => ['members', householdId] as const,
  groceryItems: (householdId: string) => ['grocery-items', householdId] as const,
  todoItems: (householdId: string) => ['todo-items', householdId] as const,
  balances: (householdId: string, month: string) =>
    ['balances', householdId, month] as const,
  wallet: (householdId: string) => ['wallet', householdId] as const,
};

// ─── Household ───────────────────────────────────────────────────────────────

export function useDeleteHousehold(
  supabase: SupabaseClient,
  householdId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (confirmationName: string) => {
      const { error } = await supabase.rpc('delete_household', {
        p_household_id: householdId,
        p_confirmation_name: confirmationName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export function useExpenses(
  supabase: SupabaseClient,
  householdId: string,
  month: string, // cycle start month, YYYY-MM
  cycleStartDay = 1
) {
  const { startDate, endExclusive } = getBudgetCycleRange(month, cycleStartDay);
  return useQuery({
    queryKey: queryKeys.expenses(householdId, month, cycleStartDay),
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, splits:expense_splits(*)')
        .eq('household_id', householdId)
        .is('voided_at', null)
        .gte('date', startDate)
        .lt('date', endExclusive)
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
        .is('voided_at', null)
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
      validateSplitTotal(inputAmount, splits);
      const householdCurrency = await getHouseholdBaseCurrency(supabase, householdId);
      const inputCurrency = (input.currency_code ?? householdCurrency).toUpperCase();
      const { convertedAmount, rate } = await convertCurrency(
        inputAmount,
        inputCurrency,
        householdCurrency
      );

      const scaledSplits = scaleSplitsToTotal(splits, inputAmount, convertedAmount);

      const { data, error } = await supabase.rpc('create_expense_with_splits', {
        p_household_id: householdId,
        p_expense: {
          ...expenseData,
          amount: convertedAmount,
          original_amount: inputAmount,
          currency_code: inputCurrency,
          fx_rate: rate,
        },
        p_splits: scaledSplits,
      });
      if (error) throw error;
      return data as Expense;
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
      const { error } = await supabase.rpc('void_expense', {
        p_expense_id: expenseId,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-all', householdId] });
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
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
      if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
        throw new Error('Bill amount must be greater than zero.');
      }
      const householdCurrency = await getHouseholdBaseCurrency(supabase, householdId);
      const inputCurrency = (input.currency_code ?? householdCurrency).toUpperCase();
      const { convertedAmount, rate } = await convertCurrency(
        inputAmount,
        inputCurrency,
        householdCurrency
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
        .eq('id', billId)
        .eq('household_id', householdId);
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

  return useMutation({
    mutationFn: async ({
      billId,
      status,
    }: {
      billId: string;
      status: 'paid' | 'pending';
    }) => {
      if (status !== 'paid') {
        throw new Error('Paid bill occurrences are immutable. Record a correcting expense instead of reopening a payment.');
      }

      const { error: paymentError } = await supabase.rpc('record_bill_payment', {
        p_bill_id: billId,
      });
      if (paymentError) throw paymentError;
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

// ─── Household Todo List ─────────────────────────────────────────────────────

export function useTodoItems(supabase: SupabaseClient, householdId: string) {
  return useQuery({
    queryKey: queryKeys.todoItems(householdId),
    queryFn: async (): Promise<TodoItem[]> => {
      const { data, error } = await supabase
        .from('todo_items')
        .select('*')
        .eq('household_id', householdId)
        .order('done', { ascending: true })
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });
}

export function useCreateTodoItem(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      notes?: string;
      priority: 'low' | 'medium' | 'high';
      due_date?: string;
      assigned_to?: string;
      created_by?: string;
    }) => {
      const { error } = await supabase.from('todo_items').insert({
        household_id: householdId,
        title: input.title,
        notes: input.notes ?? null,
        priority: input.priority,
        due_date: input.due_date ?? null,
        assigned_to: input.assigned_to ?? null,
        created_by: input.created_by ?? null,
        done: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todoItems(householdId) });
    },
  });
}

export function useToggleTodoItemDone(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, done }: { itemId: string; done: boolean }) => {
      const { error } = await supabase
        .from('todo_items')
        .update({ done, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('household_id', householdId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todoItems(householdId) });
    },
  });
}

export function useDeleteTodoItem(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('todo_items')
        .delete()
        .eq('id', itemId)
        .eq('household_id', householdId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todoItems(householdId) });
    },
  });
}

export function useClearDoneTodoItems(supabase: SupabaseClient, householdId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('todo_items')
        .delete()
        .eq('household_id', householdId)
        .eq('done', true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todoItems(householdId) });
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
  _month?: string
) {
  const { data: expenses } = useExpensesAll(supabase, householdId);
  const settlementsQuery = useQuery({
    queryKey: ['settlements', householdId],
    queryFn: async (): Promise<Settlement[]> => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('household_id', householdId)
        .order('settled_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!householdId,
  });

  return useQuery({
    queryKey: ['balances', householdId, 'all-time'],
    queryFn: (): Balance[] => aggregateBalances(expenses ?? [], settlementsQuery.data ?? []),
    enabled: !!expenses && !!settlementsQuery.data,
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
      const { error } = await supabase.rpc('record_net_settlement', {
        p_household_id: householdId,
        p_from_member_id: fromMemberId,
        p_to_member_id: toMemberId,
        p_amount: amount,
        p_note: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', householdId] });
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
