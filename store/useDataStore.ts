import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';
import { useProfileStore } from './useProfileStore';

// 3 jours en millisecondes
const CACHE_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000;

interface FavoriteCategory {
  id: string;
  name: string;
  items: any[];
  sortOrder?: string;
}

interface ProfileSpecificData {
  favorites: any[];
  favoriteCategories: FavoriteCategory[];
  localLibrary: any[];
}

interface DataState {
  movies: any[];
  channels: any[];
  series: any[];
  lastUpdated: number | null;
  isRefreshing: boolean;

  // Stockage par profil
  profilesData: Record<string, ProfileSpecificData>;

  // Anciennes données pour migration
  favorites?: any[];
  favoriteCategories?: FavoriteCategory[];
  localLibrary?: any[];
  hasMigrated?: boolean;

  setMovies: (movies: any[]) => void;
  setChannels: (channels: any[]) => void;
  setSeries: (series: any[]) => void;
  setIsRefreshing: (val: boolean) => void;
  checkAndClearCache: () => void;
  refreshData: () => void;
  startRefresh: () => void;

  // Helpers pour récupérer les données du profil actif
  getProfileData: () => ProfileSpecificData;

  toggleFavorite: (item: any) => void;
  isFavorite: (id: string | number) => boolean;

  // Méthodes Categories (Profil dépendant)
  addCategory: (name: string) => void;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, newName: string) => void;
  moveCategory: (id: string, direction: 'up' | 'down') => void;
  addItemToCategory: (categoryId: string, item: any) => void;
  removeItemFromCategory: (categoryId: string, itemId: string | number) => void;
  moveItemInCategory: (categoryId: string, itemId: string | number, direction: 'left' | 'right') => void;
  setCategorySortOrder: (categoryId: string, sortOrder: string) => void;

  // Bibliothèque Locale (Profil dépendant)
  addLocalItem: (item: any) => void;
  removeLocalItem: (id: string) => void;

  // Hub Télécommande (Pour TV)
  remoteHubIp: string;
  setRemoteHubIp: (ip: string) => void;

  // Migration
  migrateToProfile: (profileId: string) => void;
  removeProfileData: (profileId: string) => void;
}

const dataStorage = localforage.createInstance({
  name: 'iptv-platinum',
  storeName: 'data'
});

const DEFAULT_PROFILE_DATA: ProfileSpecificData = {
  favorites: [],
  favoriteCategories: [
    { id: '1', name: 'Favoris', items: [] }
  ],
  localLibrary: []
};

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      movies: [],
      channels: [],
      series: [],
      profilesData: {},
      lastUpdated: null,
      hasMigrated: false,
      remoteHubIp: '',
      isRefreshing: false,

      setMovies: (movies) => set({ movies, lastUpdated: Date.now() }),
      setChannels: (channels) => set({ channels, lastUpdated: Date.now() }),
      setSeries: (series) => set({ series, lastUpdated: Date.now() }),
      setIsRefreshing: (val) => set({ isRefreshing: val }),
      setRemoteHubIp: (remoteHubIp) => set({ remoteHubIp }),

      getProfileData: () => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return DEFAULT_PROFILE_DATA;
        return get().profilesData[activeProfileId] || DEFAULT_PROFILE_DATA;
      },

      migrateToProfile: (profileId) => {
        const state = get();
        if (state.hasMigrated) return;

        // 1. Migration des données du Store (Favoris, Catégories, Local)
        const oldFavorites = state.favorites || [];
        const oldCategories = state.favoriteCategories || DEFAULT_PROFILE_DATA.favoriteCategories;
        const oldLibrary = state.localLibrary || [];

        // 2. Migration de l'historique de lecture (LocalStorage)
        const oldHistory = localStorage.getItem('iptv_playback_history');
        if (oldHistory) {
          localStorage.setItem(`iptv_playback_history_${profileId}`, oldHistory);
          // On peut garder l'original au cas où, ou le supprimer. 
          // Ici on le laisse pour l'instant par sécurité.
        }

        // On fusionne dans le profil
        set({
          profilesData: {
            ...state.profilesData,
            [profileId]: {
              favorites: oldFavorites,
              favoriteCategories: oldCategories,
              localLibrary: oldLibrary
            }
          },
          hasMigrated: true,
          // On nettoie les vieilles clés du store
          favorites: undefined,
          favoriteCategories: undefined,
          localLibrary: undefined
        });

        console.log(`[MIGRATION] Données et historique transférés vers le profil: ${profileId}`);
      },

      removeProfileData: (profileId) => {
        const newProfilesData = { ...get().profilesData };
        delete newProfilesData[profileId];
        localStorage.removeItem(`iptv_playback_history_${profileId}`);
        set({ profilesData: newProfilesData });
      },

      toggleFavorite: (item) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const id = item.stream_id || item.series_id;
        const exists = currentData.favorites.find(f => (f.stream_id || f.series_id) === id);

        const newFavorites = exists
          ? currentData.favorites.filter(f => (f.stream_id || f.series_id) !== id)
          : [...currentData.favorites, item];

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favorites: newFavorites }
          }
        });
      },

      isFavorite: (id) => {
        const currentData = get().getProfileData();
        if (currentData.favorites.find(f => (f.stream_id || f.series_id) === id)) return true;
        return currentData.favoriteCategories.some(cat =>
          cat.items.some(i => (i.stream_id || i.series_id || i.id) === id)
        );
      },

      addCategory: (name) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const newCat = { id: Date.now().toString(), name, items: [] };

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: [...currentData.favoriteCategories, newCat] }
          }
        });
      },

      removeCategory: (id) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: currentData.favoriteCategories.filter(c => c.id !== id) }
          }
        });
      },

      renameCategory: (id, newName) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const newCategories = currentData.favoriteCategories.map(cat => {
          if (cat.id === id) {
            return { ...cat, name: newName };
          }
          return cat;
        });

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: newCategories }
          }
        });
      },

      moveCategory: (id, direction) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const index = currentData.favoriteCategories.findIndex(c => c.id === id);
        if (index === -1) return;

        const newCategories = [...currentData.favoriteCategories];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex >= 0 && targetIndex < newCategories.length) {
          const temp = newCategories[index];
          newCategories[index] = newCategories[targetIndex];
          newCategories[targetIndex] = temp;

          set({
            profilesData: {
              ...get().profilesData,
              [activeProfileId]: { ...currentData, favoriteCategories: newCategories }
            }
          });
        }
      },

      addItemToCategory: (categoryId, item) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const id = item.stream_id || item.series_id || item.id;

        const newCategories = currentData.favoriteCategories.map(cat => {
          if (cat.id === categoryId) {
            const exists = cat.items.find(i => (i.stream_id || i.series_id || i.id) === id);
            if (!exists) return { ...cat, items: [...cat.items, { ...item, _addedAt: Date.now() }] };
          }
          return cat;
        });

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: newCategories }
          }
        });
      },

      removeItemFromCategory: (categoryId, itemId) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const newCategories = currentData.favoriteCategories.map(cat => {
          if (cat.id === categoryId) {
            return { ...cat, items: cat.items.filter(i => (i.stream_id || i.series_id || i.id) !== itemId) };
          }
          return cat;
        });

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: newCategories }
          }
        });
      },

      moveItemInCategory: (categoryId, itemId, direction) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const newCategories = currentData.favoriteCategories.map(cat => {
          if (cat.id === categoryId) {
            const index = cat.items.findIndex(i => (i.stream_id || i.series_id || i.id) === itemId);
            if (index === -1) return cat;

            const newItems = [...cat.items];
            const targetIndex = direction === 'left' ? index - 1 : index + 1;

            if (targetIndex >= 0 && targetIndex < newItems.length) {
              const temp = newItems[index];
              newItems[index] = newItems[targetIndex];
              newItems[targetIndex] = temp;
              return { ...cat, items: newItems };
            }
          }
          return cat;
        });

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: newCategories }
          }
        });
      },

      setCategorySortOrder: (categoryId, sortOrder) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const newCategories = currentData.favoriteCategories.map(cat => {
          if (cat.id === categoryId) {
            return { ...cat, sortOrder };
          }
          return cat;
        });

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, favoriteCategories: newCategories }
          }
        });
      },

      addLocalItem: (item) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        const newLibrary = [...currentData.localLibrary, { ...item, isLocal: true, id: item.id || Date.now().toString() }];

        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, localLibrary: newLibrary }
          }
        });
      },

      removeLocalItem: (id) => {
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        if (!activeProfileId) return;

        const currentData = get().getProfileData();
        set({
          profilesData: {
            ...get().profilesData,
            [activeProfileId]: { ...currentData, localLibrary: currentData.localLibrary.filter(item => item.id !== id) }
          }
        });
      },

      checkAndClearCache: () => {
        const { lastUpdated } = get();
        if (lastUpdated && Date.now() - lastUpdated > CACHE_EXPIRATION_MS) {
          set({ movies: [], channels: [], series: [], lastUpdated: null });
        }
      },

      refreshData: () => {
        set({ movies: [], channels: [], series: [], lastUpdated: null });
      },

      startRefresh: () => {
        set({ movies: [], channels: [], series: [], lastUpdated: null, isRefreshing: true });
      }
    }),
    {
      name: 'iptv-data-storage',
      storage: createJSONStorage(() => ({
        getItem: (name) => dataStorage.getItem(name),
        setItem: (name, value) => dataStorage.setItem(name, value),
        removeItem: (name) => dataStorage.removeItem(name),
      })),
      skipHydration: true,
    }
  )
);
