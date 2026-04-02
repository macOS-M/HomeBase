import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Modal, Alert,
} from 'react-native';
import { useAuthStore, useUIStore } from '@homebase/store';
import { useExpenses, useCreateExpense, useCategories, useMembers } from '@homebase/api';
import { formatCurrency, calculateEqualSplits, calculatePercentageSplits } from '@homebase/utils';
import type { SplitType } from '@homebase/types';
import { supabase } from '@/lib/supabase';

function getLocalDateISO() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
}

export default function ExpensesScreen() {
  const { household } = useAuthStore();
  const { selectedMonth } = useUIStore();
  const householdId = household?.id ?? '';

  const { data: expenses = [], isLoading } = useExpenses(supabase, householdId, selectedMonth);
  const { data: categories = [] } = useCategories(supabase, householdId);
  const { data: members = [] } = useMembers(supabase, householdId);
  const createExpense = useCreateExpense(supabase, householdId);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState<SplitType>(
    household?.default_split_type === 'percentage' ? 'percentage' : 'equal'
  );

  function resetForm() {
    setName('');
    setAmount('');
    setSelectedCat('');
    setPaidBy('');
    setSplitType(household?.default_split_type === 'percentage' ? 'percentage' : 'equal');
  }

  function buildPercentageSplits(totalAmount: number) {
    const totalBudget = members.reduce((sum, m) => sum + Math.max(0, m.monthly_budget ?? 0), 0);
    if (totalBudget <= 0) {
      return calculateEqualSplits(totalAmount, members.map(m => m.id));
    }

    return calculatePercentageSplits(
      totalAmount,
      members.map((m) => ({
        member_id: m.id,
        percentage: (Math.max(0, m.monthly_budget ?? 0) / totalBudget) * 100,
      }))
    );
  }

  async function handleAdd() {
    if (!name || !amount || !selectedCat || !paidBy) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    const amt = parseFloat(amount);
    const splits =
      splitType === 'percentage'
        ? buildPercentageSplits(amt)
        : calculateEqualSplits(amt, members.map(m => m.id));

    await createExpense.mutateAsync({
      name, amount: amt, category_id: selectedCat,
      paid_by: paidBy, split_type: splitType, splits,
      date: getLocalDateISO(),
    });

    resetForm();
    setShowModal(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Expenses</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {isLoading && <Text style={styles.empty}>Loading…</Text>}
          {!isLoading && expenses.length === 0 && (
            <Text style={styles.empty}>No expenses this month yet</Text>
          )}
          {expenses.map((exp, i) => {
            const cat = categories.find(c => c.id === exp.category_id);
            const payer = members.find(m => m.id === exp.paid_by);
            const isLast = i === expenses.length - 1;
            return (
              <View key={exp.id} style={[styles.row, isLast && styles.rowLast]}>
                <View style={[styles.icon, { backgroundColor: (cat?.color ?? '#6B6560') + '22' }]}>
                  <Text style={{ fontSize: 17 }}>{cat?.icon ?? '📦'}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>{exp.name}</Text>
                  <Text style={styles.rowSub}>{exp.date} · {cat?.name} · {payer?.name}</Text>
                </View>
                <Text style={styles.rowAmount}>{formatCurrency(exp.amount)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Expense</Text>
            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <FormLabel>Description</FormLabel>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="e.g. Weekly groceries" placeholderTextColor="#9B9590" />

            <FormLabel>Amount ($)</FormLabel>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount}
              placeholder="0.00" placeholderTextColor="#9B9590" keyboardType="decimal-pad" />

            <FormLabel>Category</FormLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.pill, selectedCat === cat.id && styles.pillActive]}
                  onPress={() => setSelectedCat(cat.id)}
                >
                  <Text style={[styles.pillText, selectedCat === cat.id && styles.pillTextActive]}>
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <FormLabel>Paid by</FormLabel>
            <View style={styles.pillRow2}>
              {members.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.pill, paidBy === m.id && styles.pillActive]}
                  onPress={() => setPaidBy(m.id)}
                >
                  <Text style={[styles.pillText, paidBy === m.id && styles.pillTextActive]}>
                    {m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FormLabel>Split type</FormLabel>
            <View style={styles.splitRow}>
              {(['equal', 'percentage'] as SplitType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.splitBtn, splitType === type && styles.splitBtnActive]}
                  onPress={() => setSplitType(type)}
                >
                  <Text style={[styles.splitBtnText, splitType === type && styles.splitBtnTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {splitType === 'percentage' && (
              <Text style={styles.helperText}>Uses each member monthly budget as their share (for example 60/40).</Text>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, createExpense.isPending && styles.disabled]}
              onPress={handleAdd}
              disabled={createExpense.isPending}
            >
              <Text style={styles.submitBtnText}>
                {createExpense.isPending ? 'Adding…' : 'Add Expense'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.formLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F2EC' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1714' },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2D5F3F', alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, lineHeight: 26 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2DDD6',
    marginBottom: 24, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2DDD6',
  },
  rowLast: { borderBottomWidth: 0 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowInfo: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#1A1714' },
  rowSub: { fontSize: 12, color: '#9B9590', marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '600', color: '#1A1714' },
  empty: { textAlign: 'center', color: '#9B9590', fontSize: 14, padding: 24 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2DDD6',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1714' },
  modalClose: { fontSize: 20, color: '#9B9590' },
  modalBody: { flex: 1, padding: 20 },
  formLabel: { fontSize: 12, fontWeight: '500', color: '#6B6560', marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1.5, borderColor: '#E2DDD6', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#1A1714',
  },
  pillRow: { marginBottom: 4 },
  pillRow2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E2DDD6', marginRight: 8,
  },
  pillActive: { borderColor: '#2D5F3F', backgroundColor: '#EAF2ED' },
  pillText: { fontSize: 13, color: '#6B6560' },
  pillTextActive: { color: '#2D5F3F', fontWeight: '500' },
  splitRow: { flexDirection: 'row', gap: 8 },
  splitBtn: {
    flex: 1, padding: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2DDD6', alignItems: 'center',
  },
  splitBtnActive: { borderColor: '#2D5F3F', backgroundColor: '#EAF2ED' },
  splitBtnText: { fontSize: 13, color: '#6B6560' },
  splitBtnTextActive: { color: '#2D5F3F', fontWeight: '500' },
  helperText: { fontSize: 12, color: '#6B6560', marginTop: 8 },
  submitBtn: {
    backgroundColor: '#2D5F3F', borderRadius: 12, padding: 15,
    alignItems: 'center', marginTop: 28, marginBottom: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
