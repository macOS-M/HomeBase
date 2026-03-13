import { create } from 'zustand';
import type { Member, Household } from '@homebase/types';

// ─── Auth Store ───────────────────────────────────────────────────────────────

interface AuthState {
  user: { id: string; email: string } | null;
  member: Member | null;
  household: Household | null;
  isLoading: boolean;
  setUser: (user: AuthState['user']) => void;
  setMember: (member: Member | null) => void;
  setHousehold: (household: Household | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  member: null,
  household: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setMember: (member) => set({ member }),
  setHousehold: (household) => set({ household }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ user: null, member: null, household: null, isLoading: false }),
}));

// ─── UI Store ────────────────────────────────────────────────────────────────

interface UIState {
  selectedMonth: string; // 'YYYY-MM'
  setSelectedMonth: (month: string) => void;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const useUIStore = create<UIState>((set) => ({
  selectedMonth: currentMonth(),
  setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
}));
