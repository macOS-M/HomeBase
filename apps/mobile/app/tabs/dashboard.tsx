import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore, useUIStore } from '@homebase/store';
import { useExpenses, useBills, useBalances, useCategories, useMembers } from '@homebase/api';
import { formatCurrency, calculateSmartSettlements } from '@homebase/utils';
import { supabase } from '@/lib/supabase';

export default function DashboardScreen() {
  const router = useRouter();
  const { household, member } = useAuthStore();
  const { selectedMonth } = useUIStore();

  const householdId = household?.id ?? '';
 

  const { data: expenses = [] } = useExpenses(supabase, householdId, selectedMonth);
  const { data: bills = [] } = useBills(supabase, householdId);
  const { data: balances = [] } = useBalances(supabase, householdId, selectedMonth);
  const { data: categories = [] } = useCategories(supabase, householdId);
  const { data: members = [] } = useMembers(supabase, householdId);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const memberBudgetTotal = members.reduce((sum, m) => sum + (m.monthly_budget ?? 0), 0);
  const income = household?.monthly_income ?? memberBudgetTotal;
  const remaining = income - totalSpent;
  const pendingBills = bills.filter(b => b.status === 'pending');
  const settlements = calculateSmartSettlements(balances);

  const groceryCat = categories.find(c => c.is_grocery);
  const grocerySpent = expenses
    .filter(e => e.category_id === groceryCat?.id)
    .reduce((s, e) => s + e.amount, 0);
  const groceryPct = groceryCat?.budget_limit
    ? Math.min((grocerySpent / groceryCat.budget_limit) * 100, 100)
    : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning 👋</Text>
            <Text style={styles.householdName}>{household?.name ?? 'Your Household'}</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/tabs/expenses')}
          >
            <Text style={styles.addBtnText}>＋</Text>
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsRow}>
          <SummaryCard label="Spent" value={formatCurrency(totalSpent)} accent="#C84B31" />
          <SummaryCard label="Remaining" value={formatCurrency(remaining)} accent="#2D5F3F" />
          <SummaryCard label="Pending Bills" value={`${pendingBills.length}`} accent="#E8A020" />
          <SummaryCard label="Settlements" value={`${settlements.length}`} accent="#2B4C7E" />
        </ScrollView>

        {/* Grocery bar */}
        {groceryCat && (
          <View style={styles.section}>
            <SectionHeader title="🛒 Grocery Budget" onPress={() => {}} />
            <View style={styles.card}>
              <View style={styles.groceryTrack}>
                <View style={[styles.groceryFill, { width: `${groceryPct}%` as any }]} />
              </View>
              <View style={styles.groceryLabels}>
                <Text style={styles.grocerySpent}>{formatCurrency(grocerySpent)} spent</Text>
                <Text style={styles.groceryBudget}>of {formatCurrency(groceryCat.budget_limit ?? 0)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent expenses */}
        <View style={styles.section}>
          <SectionHeader title="Recent Expenses" onPress={() => router.push('/tabs/expenses')} />
          <View style={styles.card}>
            {expenses.slice(0, 4).map(exp => {
              const cat = categories.find(c => c.id === exp.category_id);
              const payer = members.find(m => m.id === exp.paid_by);
              return (
                <View key={exp.id} style={styles.listRow}>
                  <View style={[styles.expIcon, { backgroundColor: (cat?.color ?? '#6B6560') + '22' }]}>
                    <Text style={{ fontSize: 16 }}>{cat?.icon ?? '📦'}</Text>
                  </View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listTitle}>{exp.name}</Text>
                    <Text style={styles.listSub}>{payer?.name} · {exp.date}</Text>
                  </View>
                  <Text style={styles.listAmount}>{formatCurrency(exp.amount)}</Text>
                </View>
              );
            })}
            {expenses.length === 0 && (
              <Text style={styles.empty}>No expenses this month yet</Text>
            )}
          </View>
        </View>

        {/* Balances */}
        <View style={styles.section}>
          <SectionHeader title="Who Owes What" onPress={() => router.push('/tabs/balances')} />
          <View style={styles.card}>
            {balances.slice(0, 3).map((bal, i) => {
              const fromM = members.find(m => m.id === bal.from_member_id);
              const toM = members.find(m => m.id === bal.to_member_id);
              return (
                <View key={i} style={styles.listRow}>
                  <MemberDot name={fromM?.name} />
                  <View style={styles.listInfo}>
                    <Text style={styles.listTitle}>{fromM?.name} → {toM?.name}</Text>
                    <Text style={styles.listSub}>Unsettled balance</Text>
                  </View>
                  <Text style={[styles.listAmount, { color: '#C84B31' }]}>
                    {formatCurrency(bal.amount)}
                  </Text>
                </View>
              );
            })}
            {balances.length === 0 && (
              <Text style={styles.empty}>All settled up 🎉</Text>
            )}
          </View>
        </View>

        {/* Smart settlements callout */}
        {settlements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.settlementCallout}>
              <Text style={styles.settlementTitle}>💡 Smart Settlements</Text>
              <Text style={styles.settlementSub}>
                Just {settlements.length} payment{settlements.length !== 1 ? 's' : ''} to clear all balances
              </Text>
              <TouchableOpacity onPress={() => router.push('/tabs/balances')}>
                <Text style={styles.settlementCta}>View →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Upcoming bills */}
        <View style={[styles.section, { marginBottom: 32 }]}>
          <SectionHeader title="Upcoming Bills" onPress={() => router.push('/tabs/bills')} />
          <View style={styles.card}>
            {pendingBills.slice(0, 3).map(bill => (
              <View key={bill.id} style={styles.listRow}>
                <Text style={{ fontSize: 22, width: 34 }}>{bill.icon}</Text>
                <View style={styles.listInfo}>
                  <Text style={styles.listTitle}>{bill.name}</Text>
                  <Text style={styles.listSub}>Due {bill.due_date}</Text>
                </View>
                <Text style={styles.listAmount}>{formatCurrency(bill.amount)}</Text>
              </View>
            ))}
            {pendingBills.length === 0 && (
              <Text style={styles.empty}>No pending bills ✓</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={[styles.summaryCard, { borderTopColor: accent }]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.sectionLink}>See all</Text>
      </TouchableOpacity>
    </View>
  );
}

function MemberDot({ name }: { name?: string }) {
  const colors = ['#2D5F3F', '#C84B31', '#2B4C7E', '#7B5EA7', '#E8A020'];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <View style={[styles.memberDot, { backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{name?.[0] ?? '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F2EC' },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  greeting: { fontSize: 13, color: '#9B9590', marginBottom: 2 },
  householdName: { fontSize: 20, fontWeight: '700', color: '#1A1714' },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2D5F3F', alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, lineHeight: 26 },
  cardsRow: { paddingHorizontal: 20, gap: 10, paddingBottom: 4 },
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    minWidth: 120, borderTopWidth: 3,
    shadowColor: '#1A1714', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryLabel: { fontSize: 11, color: '#9B9590', fontWeight: '500', marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '700', color: '#1A1714' },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#1A1714' },
  sectionLink: { fontSize: 13, color: '#2D5F3F', fontWeight: '500' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E2DDD6',
    shadowColor: '#1A1714', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2DDD6',
  },
  expIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listInfo: { flex: 1, marginRight: 8 },
  listTitle: { fontSize: 14, fontWeight: '500', color: '#1A1714' },
  listSub: { fontSize: 12, color: '#9B9590', marginTop: 1 },
  listAmount: { fontSize: 14, fontWeight: '600', color: '#1A1714' },
  memberDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  empty: { textAlign: 'center', color: '#9B9590', fontSize: 13, padding: 20 },
  groceryTrack: { height: 10, backgroundColor: '#F0EDE6', borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  groceryFill: { height: '100%', backgroundColor: '#2D5F3F', borderRadius: 5 },
  groceryLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  grocerySpent: { fontSize: 13, fontWeight: '600', color: '#1A1714' },
  groceryBudget: { fontSize: 13, color: '#9B9590' },
  settlementCallout: {
    backgroundColor: '#EAF2ED', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(45,95,63,0.15)',
    flexDirection: 'row', alignItems: 'center',
  },
  settlementTitle: { fontSize: 14, fontWeight: '600', color: '#2D5F3F' },
  settlementSub: { fontSize: 12, color: '#2D5F3F', opacity: 0.7, flex: 1, marginHorizontal: 8 },
  settlementCta: { fontSize: 14, fontWeight: '700', color: '#2D5F3F' },
});
