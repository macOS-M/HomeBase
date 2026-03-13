import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useAuthStore } from '@homebase/store';
import { useBills, useToggleBillStatus } from '@homebase/api';
import { formatCurrency, getDaysUntilDue } from '@homebase/utils';
import { supabase } from '@/lib/supabase';

export default function BillsScreen() {
  const { household } = useAuthStore();
  const householdId = household?.id ?? '';

  const { data: bills = [] } = useBills(supabase, householdId);
  const toggleStatus = useToggleBillStatus(supabase, householdId);

  const pending = bills.filter(b => b.status === 'pending' || b.status === 'overdue');
  const paid = bills.filter(b => b.status === 'paid');

  function handleToggle(billId: string, current: string) {
    toggleStatus.mutate({
      billId,
      status: current === 'paid' ? 'pending' : 'paid',
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Bills</Text>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {pending.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PENDING</Text>
            <View style={styles.card}>
              {pending.map((bill, i) => {
                const daysLeft = getDaysUntilDue(bill.due_date);
                const isLast = i === pending.length - 1;
                return (
                  <View key={bill.id} style={[styles.row, isLast && styles.rowLast]}>
                    <Text style={styles.billIcon}>{bill.icon}</Text>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle}>{bill.name}</Text>
                      <Text style={[styles.rowSub, daysLeft < 0 && { color: '#C84B31' }]}>
                        {daysLeft < 0
                          ? `${Math.abs(daysLeft)}d overdue`
                          : daysLeft === 0
                          ? 'Due today'
                          : `Due in ${daysLeft}d — ${bill.due_date}`}
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>{formatCurrency(bill.amount)}</Text>
                    <TouchableOpacity
                      style={styles.toggle}
                      onPress={() => handleToggle(bill.id, bill.status)}
                    >
                      <Text style={styles.toggleText}> </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {paid.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PAID</Text>
            <View style={styles.card}>
              {paid.map((bill, i) => {
                const isLast = i === paid.length - 1;
                return (
                  <View key={bill.id} style={[styles.row, isLast && styles.rowLast, styles.rowPaid]}>
                    <Text style={styles.billIcon}>{bill.icon}</Text>
                    <View style={styles.rowInfo}>
                      <Text style={[styles.rowTitle, styles.paidText]}>{bill.name}</Text>
                      <Text style={styles.rowSub}>Paid ✓</Text>
                    </View>
                    <Text style={[styles.rowAmount, styles.paidText]}>{formatCurrency(bill.amount)}</Text>
                    <TouchableOpacity
                      style={[styles.toggle, styles.togglePaid]}
                      onPress={() => handleToggle(bill.id, bill.status)}
                    >
                      <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {bills.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>⚡</Text>
            <Text style={styles.emptyText}>No bills added yet</Text>
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F2EC' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1714' },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#9B9590',
    letterSpacing: 0.8, marginBottom: 8, marginTop: 8,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
    borderColor: '#E2DDD6', overflow: 'hidden', marginBottom: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2DDD6', gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  rowPaid: { opacity: 0.6 },
  billIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#1A1714' },
  rowSub: { fontSize: 12, color: '#9B9590', marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: '600', color: '#1A1714' },
  paidText: { color: '#9B9590' },
  toggle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#E2DDD6',
    alignItems: 'center', justifyContent: 'center',
  },
  togglePaid: { backgroundColor: '#2D5F3F', borderColor: '#2D5F3F' },
  toggleText: { fontSize: 12 },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#9B9590' },
});
