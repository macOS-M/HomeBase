import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { useAuthStore, useUIStore } from '@homebase/store';
import { useBalances, useMembers, useSettleBalance } from '@homebase/api';
import { formatCurrency, calculateSmartSettlements } from '@homebase/utils';
import { supabase } from '@/lib/supabase';

export default function BalancesScreen() {
  const { household } = useAuthStore();
  const { selectedMonth } = useUIStore();
  const householdId = household?.id ?? '';

  const { data: balances = [] } = useBalances(supabase, householdId, selectedMonth);
  const { data: members = [] } = useMembers(supabase, householdId);
  const settle = useSettleBalance(supabase, householdId);

  const settlements = calculateSmartSettlements(balances);

  function handleSettle(fromId: string, toId: string, amount: number) {
    const fromM = members.find(m => m.id === fromId);
    const toM = members.find(m => m.id === toId);
    Alert.alert(
      'Confirm Settlement',
      `Mark ${fromM?.name} → ${toM?.name} (${formatCurrency(amount)}) as settled?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle', onPress: () =>
            settle.mutate({ fromMemberId: fromId, toMemberId: toId, amount }),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Balances</Text>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Smart settlements */}
        {settlements.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>💡 SMART SETTLEMENTS</Text>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>
                {settlements.length} payment{settlements.length !== 1 ? 's' : ''} to settle everything
              </Text>
              <Text style={styles.calloutSub}>
                Minimum transactions — no wasted effort
              </Text>
            </View>
            <View style={styles.card}>
              {settlements.map((s, i) => {
                const fromM = members.find(m => m.id === s.from_member_id);
                const toM = members.find(m => m.id === s.to_member_id);
                const isLast = i === settlements.length - 1;
                return (
                  <View key={i} style={[styles.row, isLast && styles.rowLast]}>
                    <MemberDot name={fromM?.name} />
                    <Text style={styles.arrow}>→</Text>
                    <MemberDot name={toM?.name} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle}>{fromM?.name} pays {toM?.name}</Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: '#2D5F3F' }]}>
                      {formatCurrency(s.amount)}
                    </Text>
                    <TouchableOpacity
                      style={styles.settleBtn}
                      onPress={() => handleSettle(s.from_member_id, s.to_member_id, s.amount)}
                    >
                      <Text style={styles.settleBtnText}>Settle</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Raw balances */}
        <Text style={styles.sectionLabel}>ALL BALANCES</Text>
        {balances.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={styles.emptyText}>All settled up!</Text>
            <Text style={styles.emptySub}>No outstanding balances</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {balances.map((bal, i) => {
              const fromM = members.find(m => m.id === bal.from_member_id);
              const toM = members.find(m => m.id === bal.to_member_id);
              const isLast = i === balances.length - 1;
              return (
                <View key={i} style={[styles.row, isLast && styles.rowLast]}>
                  <MemberDot name={fromM?.name} />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{fromM?.name} owes {toM?.name}</Text>
                    <Text style={styles.rowSub}>From shared expenses</Text>
                  </View>
                  <Text style={[styles.rowAmount, { color: '#C84B31' }]}>
                    {formatCurrency(bal.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberDot({ name }: { name?: string }) {
  const colors = ['#2D5F3F', '#C84B31', '#2B4C7E', '#7B5EA7', '#E8A020'];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <View style={[styles.dot, { backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{name?.[0] ?? '?'}</Text>
    </View>
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
  callout: {
    backgroundColor: '#EAF2ED', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(45,95,63,0.15)', marginBottom: 10,
  },
  calloutTitle: { fontSize: 14, fontWeight: '600', color: '#2D5F3F' },
  calloutSub: { fontSize: 12, color: '#2D5F3F', opacity: 0.7, marginTop: 2 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
    borderColor: '#E2DDD6', overflow: 'hidden', marginBottom: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2DDD6', gap: 8,
  },
  rowLast: { borderBottomWidth: 0 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 14, color: '#9B9590' },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#1A1714' },
  rowSub: { fontSize: 12, color: '#9B9590', marginTop: 1 },
  rowAmount: { fontSize: 14, fontWeight: '700' },
  settleBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#E2DDD6', backgroundColor: '#F5F2EC',
  },
  settleBtnText: { fontSize: 12, fontWeight: '500', color: '#1A1714' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1A1714' },
  emptySub: { fontSize: 14, color: '#9B9590', marginTop: 4 },
});
