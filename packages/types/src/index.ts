// ─── Auth & Members ───────────────────────────────────────────────────────────

export type MemberRole = 'admin' | 'member';

export interface Member {
  id: string;
  household_id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
  monthly_budget?: number;
  role: MemberRole;
  joined_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_by: string;
  monthly_income?: number;
  default_split_type?: 'equal' | 'percentage';
  budget_period: 'monthly' | 'biweekly' | 'custom';
  invite_code: string;
  created_at: string;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export type SplitType = 'equal' | 'percentage' | 'assigned';

export interface ExpenseSplit {
  member_id: string;
  amount: number;
  percentage?: number;
  is_settled: boolean;
}

export interface ExpenseReceiptItem {
  name: string;
  cost?: number;
  quantity?: string;
  notes?: string;
}

export interface Expense {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  original_amount?: number;
  currency_code?: string;
  fx_rate?: number;
  source_type?: 'manual' | 'bill';
  source_bill_id?: string;
  category_id: string;
  paid_by: string; // member_id
  split_type: SplitType;
  splits: ExpenseSplit[];
  date: string;
  receipt_url?: string;
  receipt_items?: ExpenseReceiptItem[];
  notes?: string;
  created_at: string;
}

export interface CreateExpenseInput {
  name: string;
  amount: number;
  currency_code?: string;
  source_type?: 'manual' | 'bill';
  source_bill_id?: string;
  category_id: string;
  paid_by: string;
  split_type: SplitType;
  splits: Omit<ExpenseSplit, 'is_settled'>[];
  date: string;
  receipt_url?: string;
  receipt_items?: ExpenseReceiptItem[];
  notes?: string;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  household_id: string;
  source_type?: 'system' | 'custom';
  system_category_id?: string;
  name: string;
  icon: string;
  color: string;
  budget_limit?: number;
  is_grocery: boolean;
}

// ─── Bills ───────────────────────────────────────────────────────────────────

export type BillStatus = 'paid' | 'pending' | 'overdue';
export type RecurringInterval = 'monthly' | 'weekly' | 'yearly' | 'once';

export interface Bill {
  id: string;
  household_id: string;
  name: string;
  icon: string;
  amount: number;
  original_amount?: number;
  currency_code?: string;
  fx_rate?: number;
  due_date: string;
  status: BillStatus;
  recurring: RecurringInterval;
  paid_at?: string;
  created_at: string;
}

export interface CreateBillInput {
  name: string;
  icon: string;
  amount: number;
  currency_code?: string;
  due_date: string;
  recurring: RecurringInterval;
}

// ─── Grocery List ────────────────────────────────────────────────────────────

export type GroceryPriority = 'low' | 'medium' | 'high';

export interface GroceryItem {
  id: string;
  household_id: string;
  name: string;
  quantity?: string;
  notes?: string;
  priority: GroceryPriority;
  done: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Household Todo List ─────────────────────────────────────────────────────

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  household_id: string;
  title: string;
  notes?: string;
  priority: TodoPriority;
  due_date?: string;
  assigned_to?: string;
  created_by?: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Balances & Settlements ───────────────────────────────────────────────────

export interface Balance {
  from_member_id: string;
  to_member_id: string;
  amount: number;
}

export interface Settlement {
  id: string;
  household_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  settled_at: string;
  note?: string;
}

export interface SmartSettlement {
  from_member_id: string;
  to_member_id: string;
  amount: number;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletTransaction {
  id: string;
  household_id: string;
  member_id: string;
  amount: number; // positive = deposit, negative = withdrawal
  description: string;
  created_at: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface CategorySummary {
  category: Category;
  spent: number;
  budget_limit: number;
  percentage: number;
}

export interface DashboardData {
  monthly_income: number;
  total_spent: number;
  remaining: number;
  pending_bills_total: number;
  category_summaries: CategorySummary[];
  recent_expenses: Expense[];
  balances: Balance[];
  upcoming_bills: Bill[];
  grocery_spent: number;
  grocery_budget: number;
  wallet_balance: number;
}
