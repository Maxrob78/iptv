import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';

export interface ProxySettings {
  enabled: boolean;
  host: string;
  port: string;
  username?: string;
  password?: string;
}

interface AuthState {
  isLoggedIn: boolean;
  serverUrl: string;
  username: string;
  password: string;
  proxy: ProxySettings | null;
  login: (serverUrl: string, user: string, pass: string) => Promise<boolean>;
  setProxy: (proxy: ProxySettings) => void;
  logout: () => void;
}

// Configuration de localforage pour être ultra-stable
export const authStorage = localforage.createInstance({
  name: 'iptv-platinum',
  storeName: 'auth'
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      serverUrl: '',
      username: '',
      password: '',
      proxy: {
        enabled: false,
        host: '',
        port: '',
        username: '',
        password: ''
      },
      login: async (serverUrl, username, password) => {
        try {
          const url = new URL(serverUrl);
          const apiUrl = `${url.origin}/player_api.php?username=${username}&password=${password}`;
          const response = await fetch(apiUrl);
          const data = await response.json();
          if (data?.user_info?.auth === 1) {
            set({ isLoggedIn: true, serverUrl: url.origin, username, password });
            return true;
          }
          return false;
        } catch (error) {
          console.error("Auth Fail:", error);
          return false;
        }
      },
      setProxy: (proxy) => set({ proxy }),
      logout: () => set({ isLoggedIn: false, serverUrl: '', username: '', password: '', proxy: null }),
    }),
    {
      name: 'iptv-auth-storage',
      storage: createJSONStorage(() => ({
        getItem: (name) => authStorage.getItem(name),
        setItem: (name, value) => authStorage.setItem(name, value),
        removeItem: (name) => authStorage.removeItem(name),
      })),
      skipHydration: true, // Crucial pour Next.js !
    }
  )
);
