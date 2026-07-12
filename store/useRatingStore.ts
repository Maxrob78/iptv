import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';
import { useProfileStore } from './useProfileStore';

export interface Rating {
  id: string; // stream_id
  rating: number; // 1 to 10
  timestamp: number;
}

interface RatingState {
  ratings: Record<string, Record<string, Rating>>; // profileId -> { streamId -> Rating }
  setRating: (streamId: string | number, rating: number) => void;
  getRating: (streamId: string | number) => number | null;
  removeRating: (streamId: string | number) => void;
}

const ratingStorage = localforage.createInstance({
  name: 'iptv-platinum',
  storeName: 'ratings'
});

export const useRatingStore = create<RatingState>()(
  persist(
    (set, get) => ({
      ratings: {},
      setRating: (streamId, rating) => {
        const profileId = useProfileStore.getState().activeProfile?.id || 'default';
        const strId = String(streamId);
        set((state) => {
          const profileRatings = state.ratings[profileId] || {};
          return {
            ratings: {
              ...state.ratings,
              [profileId]: {
                ...profileRatings,
                [strId]: {
                  id: strId,
                  rating,
                  timestamp: Date.now()
                }
              }
            }
          };
        });
      },
      getRating: (streamId) => {
        const profileId = useProfileStore.getState().activeProfile?.id || 'default';
        const strId = String(streamId);
        const state = get();
        return state.ratings[profileId]?.[strId]?.rating || null;
      },
      removeRating: (streamId) => {
        const profileId = useProfileStore.getState().activeProfile?.id || 'default';
        const strId = String(streamId);
        set((state) => {
          const profileRatings = { ...(state.ratings[profileId] || {}) };
          delete profileRatings[strId];
          return {
            ratings: {
              ...state.ratings,
              [profileId]: profileRatings
            }
          };
        });
      }
    }),
    {
      name: 'iptv-ratings-storage',
      storage: createJSONStorage(() => ({
        getItem: (name) => ratingStorage.getItem(name),
        setItem: (name, value) => ratingStorage.setItem(name, value),
        removeItem: (name) => ratingStorage.removeItem(name),
      })),
      skipHydration: true,
    }
  )
);
