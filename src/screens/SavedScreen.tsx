import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, spacing, radius, typography } from '@/lib/theme';
import { PLACES } from '@/data/places';
import { useSaved } from '@/hooks/useSaved';
import { useRatings } from '@/hooks/useRatings';

export default function SavedScreen() {
  const { savedIds, toggleSave, refetch } = useSaved();
  const { ratings } = useRatings();

  useEffect(() => { refetch(); }, []);

  const savedPlaces = PLACES.filter((p) => savedIds.has(p.id));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus lugares</Text>
        <Text style={styles.sub}>
          {savedPlaces.length > 0
            ? `${savedPlaces.length} lugar${savedPlaces.length > 1 ? 'es salvos' : ' salvo'}`
            : 'Nenhum lugar salvo ainda'}
        </Text>
      </View>

      {savedPlaces.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Text style={{ fontSize: 32 }}>🗂️</Text></View>
          <Text style={styles.emptyTitle}>Lista vazia</Text>
          <Text style={styles.emptySub}>Descubra lugares e curta para salvar aqui.</Text>
        </View>
      ) : (
        <FlatList
          data={savedPlaces}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const grad = gradients[item.gradientKey] ?? gradients.rooftop;
            const stars = ratings[item.id] ?? 0;
            return (
              <View style={styles.row}>
                <LinearGradient colors={grad} style={styles.thumb} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                </LinearGradient>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>{item.category} · {item.neighborhood} · {item.hours}</Text>
                  {stars > 0 && (
                    <Text style={styles.rowStars}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</Text>
                  )}
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowPrice}>{item.price}</Text>
                  <TouchableOpacity onPress={() => toggleSave(item)} style={styles.removeBtn}>
                    <Text style={styles.removeTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  title: { ...typography.h2, color: colors.text },
  sub: { fontSize: 13, color: colors.text2, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.bg5, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.text2, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.bg4, borderRadius: radius.lg, padding: spacing.md },
  thumb: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.text2 },
  rowStars: { fontSize: 12, color: colors.gold, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: colors.p300 },
  removeBtn: { padding: 4 },
  removeTxt: { fontSize: 13, color: colors.text3 },
});
