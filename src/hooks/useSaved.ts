import { useState, useEffect, useCallback } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from './useAuth';
import { Place } from '@/data/places';
import { Collections } from '@/lib/firebase';

export function useSaved() {
  const { user } = useAuth();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchSaved = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const snap = await firestore()
      .collection(Collections.SAVED)
      .where('userId', '==', user.uid)
      .get();
    setSavedIds(new Set(snap.docs.map((d) => d.data().placeId)));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  async function toggleSave(place: Place) {
    if (!user) return;
    const isSaved = savedIds.has(place.id);

    if (isSaved) {
      setSavedIds((prev) => { const next = new Set(prev); next.delete(place.id); return next; });
      // Busca e deleta o documento
      const snap = await firestore()
        .collection(Collections.SAVED)
        .where('userId', '==', user.uid)
        .where('placeId', '==', place.id)
        .get();
      snap.docs.forEach((d) => d.ref.delete());
    } else {
      setSavedIds((prev) => new Set(prev).add(place.id));
      await firestore().collection(Collections.SAVED).add({
        userId: user.uid,
        placeId: place.id,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  return { savedIds, toggleSave, loading, refetch: fetchSaved };
}
