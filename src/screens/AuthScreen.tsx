import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing, radius, typography } from '@/lib/theme';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    if (!email || !password || (mode === 'signup' && !name)) {
      setError('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    const result = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password, name);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#0A0810', '#180e30', '#0A0810']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.hero}>
          <Text style={styles.logo}>OndeIr<Text style={styles.logoAccent}>Curitiba</Text></Text>
          <Text style={styles.tagline}>Descubra os melhores rolês da cidade</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            {(['login', 'signup'] as const).map((m) => (
              <TouchableOpacity key={m} style={[styles.tab, mode === m && styles.tabActive]} onPress={() => { setMode(m); setError(''); }}>
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {m === 'login' ? 'Entrar' : 'Cadastrar'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Seu nome"
              placeholderTextColor={colors.text3}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor={colors.text3}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor={colors.text3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.btnText}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  hero: { alignItems: 'center', marginBottom: spacing.xxxl },
  logo: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  logoAccent: { color: colors.p400 },
  tagline: { fontSize: 14, color: colors.text2, marginTop: spacing.sm, textAlign: 'center' },
  card: {
    backgroundColor: colors.bg2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.bg5,
    padding: spacing.xl,
    gap: spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bg3,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
  },
  tabActive: { backgroundColor: colors.p500 },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.text3 },
  tabTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.bg5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  error: { fontSize: 13, color: colors.red, textAlign: 'center' },
  btn: {
    backgroundColor: colors.p500,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
