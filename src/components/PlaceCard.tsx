import React from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, gradients, radius, spacing, typography } from '@/lib/theme';
import { Place } from '@/data/places';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - spacing.xl * 2;
const SWIPE_THRESHOLD = 110;

type Props = {
  place: Place;
  rating: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onRate: (stars: number) => void;
  isTop: boolean;
  stackIndex: number;
};

export default function PlaceCard({ place, rating, onSwipeLeft, onSwipeRight, onRate, isTop, stackIndex }: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1 - stackIndex * 0.04);
  const translateY = useSharedValue(stackIndex * 10);

  const pan = Gesture.Pan()
    .enabled(isTop)
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY * 0.3;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir = e.translationX > 0 ? 1 : -1;
        tx.value = withTiming(dir * SCREEN_W * 1.5, { duration: 380 }, () => {
          runOnJS(dir > 0 ? onSwipeRight : onSwipeLeft)();
        });
      } else {
        tx.value = withSpring(0, { damping: 15 });
        ty.value = withSpring(0, { damping: 15 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-SCREEN_W, 0, SCREEN_W], [-18, 0, 18], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: isTop ? tx.value : 0 },
        { translateY: isTop ? ty.value : translateY.value },
        { rotate: `${rotate}deg` },
        { scale: isTop ? 1 : scale.value },
      ],
      opacity: isTop ? 1 : 1 - stackIndex * 0.18,
    };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [40, 120], [0, 1], Extrapolation.CLAMP),
  }));

  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-40, -120], [0, 1], Extrapolation.CLAMP),
  }));

  const grad = gradients[place.gradientKey] ?? gradients.rooftop;

  function openInstagram() {
    const handle = place.instagram.replace('@', '');
    Linking.openURL(`https://instagram.com/${handle}`);
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 1 }} />

        {/* Emoji background */}
        <Text style={styles.emojiBg}>{place.emoji}</Text>

        {/* Stamps */}
        <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
          <Text style={[styles.stampText, { color: colors.green }]}>CURTIR</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampNope, nopeStyle]}>
          <Text style={[styles.stampText, { color: colors.red }]}>PASSAR</Text>
        </Animated.View>

        {/* Top badges */}
        <View style={styles.topRow}>
          <View style={styles.catTag}>
            <Text style={styles.catTagText}>{place.category.toUpperCase()}</Text>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceTagText}>{place.price}</Text>
          </View>
        </View>

        {/* Bottom content */}
        <View style={styles.bottom}>
          <Text style={styles.name}>{place.name}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>📍 {place.neighborhood}</Text>
            <View style={styles.dot} />
            <Text style={styles.meta}>🕐 {place.hours}</Text>
          </View>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.igChip} onPress={openInstagram}>
              <Text style={styles.igText}>📷 {place.instagram}</Text>
            </TouchableOpacity>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => onRate(n)} hitSlop={6}>
                  <Text style={[styles.star, n <= rating && styles.starFilled]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_W,
    height: 470,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  emojiBg: {
    position: 'absolute',
    right: -10,
    top: 40,
    fontSize: 120,
    opacity: 0.12,
  },
  topRow: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catTag: {
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  catTagText: {
    color: colors.p100,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  priceTag: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  priceTagText: {
    color: colors.p200,
    fontSize: 13,
    fontWeight: '700',
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xxl,
    paddingBottom: spacing.xl,
    background: 'transparent',
  },
  name: {
    ...typography.h1,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  meta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  igChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  igText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
  stars: {
    flexDirection: 'row',
    gap: 4,
  },
  star: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.2)',
  },
  starFilled: {
    color: colors.gold,
  },
  stamp: {
    position: 'absolute',
    top: 28,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2.5,
    zIndex: 10,
  },
  stampLike: {
    left: 22,
    borderColor: colors.green,
    backgroundColor: 'rgba(52,211,153,0.12)',
    transform: [{ rotate: '-14deg' }],
  },
  stampNope: {
    right: 22,
    borderColor: colors.red,
    backgroundColor: 'rgba(248,113,113,0.12)',
    transform: [{ rotate: '14deg' }],
  },
  stampText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
