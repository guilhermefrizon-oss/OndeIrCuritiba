import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { useSaved } from '@/hooks/useSaved';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { savedIds } = useSaved();
  const name = user?.user_metadata?.name ?? 'Usuário';
  const email = user?.email ?? '';
  const initials = name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  function confirmSignOut() {
    Alert.alert('Sair', 'Tem certeza que quer sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>Perfil</Text>

      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{savedIds.size}</Text>
          <Text style={styles.statLabel}>Salvos</Text>
        </View>
        <View style={styles.statDiv} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>CWB</Text>
          <Text style={styles.statLabel}>Cidade</Text>
        </View>
      </View>

      <View style={styles.menu}>
        <MenuItem icon="🔔" label="Notificações" />
        <MenuItem icon="🔒" label="Privacidade" />
        <MenuItem icon="💬" label="Sugerir um lugar" />
        <MenuItem icon="⭐" label="Avaliar o app" />
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sair da conta</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label }: { icon: string; label: string }) {
  return (
    <TouchableOpacity style={styles.menuItem}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xl },
  card: { backgroundColor: colors.bg2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.bg5, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg },
  avatarWrap: { marginBottom: spacing.md },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.p500, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 24, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  email: { fontSize: 13, color: colors.text2 },
  statsRow: { flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.bg5, padding: spacing.lg, marginBottom: spacing.lg, justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.p300 },
  statLabel: { fontSize: 12, color: colors.text2 },
  statDiv: { width: 1, height: 32, backgroundColor: colors.bg5 },
  menu: { backgroundColor: colors.bg2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.bg5, overflow: 'hidden', marginBottom: spacing.xl },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.bg4 },
  menuIcon: { fontSize: 18, marginRight: spacing.md },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text },
  menuArrow: { fontSize: 20, color: colors.text3 },
  signOutBtn: { backgroundColor: colors.bg2, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F87171', padding: spacing.lg, alignItems: 'center' },
  signOutText: { color: colors.red, fontSize: 15, fontWeight: '600' },
});
