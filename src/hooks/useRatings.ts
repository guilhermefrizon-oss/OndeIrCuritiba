import { useState, useEffect, useCallback } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from './useAuth';
import { Collections } from '@/lib/firebase';

export function useRatings() {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const fetchRatings = useCallback(async () => {
    if (!user) return;
    const snap = await firestore()
      .collection(Collections.RATINGS)
      .where('userId', '==', user.uid)
      .get();
    const map: Record<string, number> = {};
    snap.docs.forEach((d) => { map[d.data().placeId] = d.data().stars; });
    setRatings(map);
  }, [user]);

  useEffect(() => { fetchRatings(); }, [fetchRatings]);

  async function rate(placeId: string, stars: number) {
    if (!user) return;
    setRatings((prev) => ({ ...prev, [placeId]: stars }));

    // Upsert: busca doc existente ou cria novo
    const snap = await firestore()
      .collection(Collections.RATINGS)
      .where('userId', '==', user.uid)
      .where('placeId', '==', placeId)
      .get();

    if (snap.empty) {
      await firestore().collection(Collections.RATINGS).add({
        userId: user.uid,
        placeId,
        stars,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await snap.docs[0].ref.update({ stars });
    }
  }

  return { ratings, rate };
}
