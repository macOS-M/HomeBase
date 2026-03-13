import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@homebase/store';
import { useWallet } from '@homebase/api';
import { formatCurrency } from '@homebase/utils';
import { supabase } from '@/lib/supabase';

export default function MoreScreen() {
  const router = useRouter();
  const { household, member } = useAuthStore();
  const householdId = household?.id ?? '';
  const { data: wallet } = useWallet(supabase, householdId);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{member?.name?.[0] ?? '?'}</Text>
          </View>
          <View>
            <Text style={styles.profileName}>{member?.name}</Text>
            <Text style={styles.profileRole}>{member?.role} · {household?.name}</Text>
          </View>
        </View>

        {/* Wallet balance */}
        <View style={styles.walletCard}>
          <View>
            <Text style={styles.walletLabel}>HOUSEHOLD WALLET</Text>
            <Text style={styles.walletAmount}>{formatCurrency(wallet?.balance ?? 0)}</Text>
          </View>
          <TouchableOpacity style={styles.walletBtn}>
            <Text style={styles.walletBtnText}>＋ Add Funds</Text>
          </TouchableOpacity>
        </View>

        {/* Quick links */}
        <Text style={styles.sectionLabel}>FEATURES</Text>
        <View style={styles.menuCard}>
          <MenuItem icon="🛒" label="Grocery Budget" sub="Track monthly grocery spending" onPress={() => {}} />
          <MenuItem icon="🏷️" label="Categories" sub="Manage budget limits" onPress={() => {}} />
          <MenuItem icon="👥" label="Members" sub={`${household?.invite_code ? `Invite code: ${household.invite_code}` : 'Manage household'}`} onPress={() => {}} />
          <MenuItem icon="⚙️" label="Household Settings" sub="Name, budget period, income" onPress={() => {}} last />
        </View>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.menuCard}>
          <MenuItem icon="🔔" label="Notifications" sub="Bill reminders and alerts" onPress={() => {}} />
          <MenuItem icon="🚪" label="Sign out" sub="" onPress={handleSignOut} last danger />
        </View>

        <Text style={styles.inviteBox}>
          Share invite code{' '}
          <Text style={styles.inviteCode}>{household?.invite_code}</Text>
          {' '}to add members
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({
  icon, label, sub, onPress, last, danger,
}: {
  icon: string; label: string; sub: string;
  onPress: () => void; last?: boolean; danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, last && styles.menuRowLast]}
      onPress={onPress}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.menuInfo}>
        <Text style={[styles.menuLabel, danger && { color: '#C84B31' }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F2EC' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1714' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2DDD6', marginBottom: 14,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2D5F3F', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  profileName: { fontSize: 16, fontWeight: '600', color: '#1A1714' },
  profileRole: { fontSize: 12, color: '#9B9590', marginTop: 2, textTransform: 'capitalize' },
  walletCard: {
    backgroundColor: '#1A1714', borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
  },
  walletLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, marginBottom: 4 },
  walletAmount: { fontSize: 26, fontWeight: '700', color: '#fff' },
  walletBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  walletBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#9B9590',
    letterSpacing: 0.8, marginBottom: 8,
  },
  menuCard: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
    borderColor: '#E2DDD6', overflow: 'hidden', marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#E2DDD6', gap: 12,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuInfo: { flex: 1 },
  menuLabel: { fontSize: 14, fontWeight: '500', color: '#1A1714' },
  menuSub: { fontSize: 12, color: '#9B9590', marginTop: 1 },
  menuChevron: { fontSize: 20, color: '#C8C4BF' },
  inviteBox: {
    textAlign: 'center', fontSize: 13, color: '#9B9590',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E2DDD6',
  },
  inviteCode: { fontWeight: '700', color: '#1A1714', fontFamily: 'monospace' },
});
