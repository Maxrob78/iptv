import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Profile {
  id: string;
  name: string;
  avatar: string;
}

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  addProfile: (name: string, avatar: string) => void;
  updateProfile: (id: string, name: string, avatar: string) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (profile: Profile | null) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profiles: [],
      activeProfile: null,
      addProfile: (name, avatar) => set((state) => ({
        profiles: [...state.profiles, { id: Math.random().toString(36).substr(2, 9), name, avatar }]
      })),
      updateProfile: (id, name, avatar) => set((state) => ({
        profiles: state.profiles.map(p => p.id === id ? { ...p, name, avatar } : p),
        activeProfile: state.activeProfile?.id === id ? { ...state.activeProfile, name, avatar } : state.activeProfile
      })),
      removeProfile: (id) => set((state) => ({
        profiles: state.profiles.filter(p => p.id !== id),
        activeProfile: state.activeProfile?.id === id ? null : state.activeProfile
      })),
      setActiveProfile: (profile) => set({ activeProfile: profile }),
    }),
    {
      name: 'iptv_profiles_storage',
    }
  )
);
