import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleMagicLink() {
    if (!email) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Deep link back into the app after clicking the email link
        emailRedirectTo: 'homebase://auth/callback',
      },
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <Text style={styles.logo}>HomeBase</Text>
          <Text style={styles.tagline}>Shared budgeting for your household</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {sent ? (
            <View style={styles.sentState}>
              <Text style={styles.sentEmoji}>📬</Text>
              <Text style={styles.sentTitle}>Check your email</Text>
              <Text style={styles.sentBody}>
                We sent a magic link to{' '}
                <Text style={{ fontWeight: '600' }}>{email}</Text>.
                Tap it to sign in.
              </Text>
              <TouchableOpacity onPress={() => setSent(false)} style={{ marginTop: 20 }}>
                <Text style={styles.link}>Use a different email</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.cardTitle}>Sign in</Text>

              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9B9590"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabled]}
                onPress={handleMagicLink}
                disabled={loading}
              >
                <Text style={styles.primaryBtnText}>
                  {loading ? 'Sending…' : 'Send magic link'}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Join with invite code</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F2EC' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: '700', color: '#1A1714', letterSpacing: -1 },
  tagline: { fontSize: 14, color: '#6B6560', marginTop: 6 },
  card: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: '#E2DDD6',
    shadowColor: '#1A1714', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#1A1714', marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '500', color: '#6B6560', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E2DDD6', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#1A1714', marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#2D5F3F', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2DDD6' },
  dividerText: { fontSize: 12, color: '#9B9590' },
  secondaryBtn: {
    borderWidth: 1.5, borderColor: '#E2DDD6', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  secondaryBtnText: { color: '#1A1714', fontSize: 14, fontWeight: '500' },
  sentState: { alignItems: 'center', paddingVertical: 12 },
  sentEmoji: { fontSize: 40, marginBottom: 12 },
  sentTitle: { fontSize: 18, fontWeight: '600', color: '#1A1714', marginBottom: 8 },
  sentBody: { fontSize: 14, color: '#6B6560', textAlign: 'center', lineHeight: 20 },
  link: { fontSize: 14, color: '#2D5F3F', fontWeight: '500' },
});
