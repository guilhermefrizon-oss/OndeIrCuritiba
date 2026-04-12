import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { PLACES, CATEGORIES, Place } from '@/data/places';
import PlaceCard from '@/components/PlaceCard';
import { useSaved } from '@/hooks/useSaved';
import { useRatings } from '@/hooks/useRatings';
import { useAuth } from '@/hooks/useAuth';

const { width: W } = Dimensions.get('window');

export default function DiscoverScreen() {
  const { user } = useAuth();
  const { savedIds, toggleSave } = useSaved();
  const { ratings, rate } = useRatings();
  const [activeCat, setActiveCat] = useState('Todos');
  const [idx, setIdx] = useState(0);

  const filtered = useMemo(
    () => activeCat === 'Todos' ? PLACES : PLACES.filter((p) => p.category === activeCat),
    [activeCat]
  );

  const currentPlace = filtered[idx % filtered.length];
  const nextPlace = filtered[(idx + 1) % filtered.length];
  const thirdPlace = filtered[(idx + 2) % filtered.length];

  function advance() { setIdx((i) => i + 1); }

  function handleCatChange(cat: string) {
    setActiveCat(cat);
    setIdx(0);
  }

  const initials = user?.user_metadata?.name
    ? user.user_metadata.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>OndeIr<Text style={styles.logoAccent}>Curitiba</Text></Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.locPill}>
            <View style={styles.locDot} />
            <Text style={styles.locText}>Curitiba, PR</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
      </View>

      {/* Categories */}
      <Text style={styles.catsLabel}>Categoria</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catsRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.label}
            style={[styles.catPill, activeCat === cat.label && styles.catPillActive]}
            onPress={() => handleCatChange(cat.label)}
          >
            <Text style={styles.catEmoji}>{cat.emoji}</Text>
            <Text style={[styles.catLabel, activeCat === cat.label && styles.catLabelActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Card stack */}
      <View style={styles.stackWrap}>
        {[thirdPlace, nextPlace, currentPlace].map((place, i) => (
          place ? (
            <PlaceCard
              key={`${place.id}-${idx}-${i}`}
              place={place}
              rating={ratings[place.id] ?? 0}
              isTop={i === 2}
              stackIndex={2 - i}
              onSwipeLeft={advance}
              onSwipeRight={() => { toggleSave(place); advance(); }}
              onRate={(stars) => rate(place.id, stars)}
            />
          ) : null
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <ActionBtn icon="✕" label="Passar" color={colors.text3} borderColor={colors.bg5} bg={colors.bg2} onPress={advance} />
        <ActionBtn icon="🔖" label="Salvar" color={colors.p300} borderColor={colors.p300} bg={`${colors.p500}15`} onPress={() => { if (currentPlace) toggleSave(currentPlace); }} />
        <ActionBtn icon="♥" label="Curtir" color={colors.green} borderColor={colors.green} bg={`${colors.green}15`} onPress={() => { if (currentPlace) { toggleSave(currentPlace); advance(); } }} />
      </View>
    </SafeAreaView>
  );
}

function ActionBtn({ icon, label, color, borderColor, bg, onPress }: {
  icon: string; label: string; color: string; borderColor: string; bg: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionCircle, { borderColor, backgroundColor: bg }]}>
        <Text style={[styles.actionIcon, { color }]}>{icon}</Text>
      </View>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  logo: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  logoAccent: { color: colors.p400 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.bg5, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  locDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.p300 },
  locText: { fontSize: 12, color: colors.text2, fontWeight: '500' },
  avatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.p500, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  catsLabel: { ...typography.label, color: colors.text3, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  catsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.lg },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.bg5, backgroundColor: colors.bg2 },
  catPillActive: { backgroundColor: colors.p500, borderColor: colors.p500 },
  catEmoji: { fontSize: 13 },
  catLabel: { fontSize: 13, color: colors.text2 },
  catLabelActive: { color: colors.white, fontWeight: '600' },
  stackWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.lg, paddingBottom: spacing.xl },
  actionBtn: { alignItems: 'center', gap: 5 },
  actionCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
});
