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
  expDate: string | null;
  login: (serverUrl: string, user: string, pass: string) => Promise<boolean>;
  checkAuth: () => Promise<void>;
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
    (set, get) => ({
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
      expDate: null,
      login: async (serverUrl, username, password) => {
        try {
          const url = new URL(serverUrl);
          const apiUrl = `${url.origin}/player_api.php?username=${username}&password=${password}`;
          const response = await fetch(apiUrl);
          const data = await response.json();
          if (data?.user_info?.auth === 1) {
            let expDate = null;
            if (data.user_info.exp_date && data.user_info.exp_date !== 'null') {
              const date = new Date(parseInt(data.user_info.exp_date) * 1000);
              expDate = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }
            set({ isLoggedIn: true, serverUrl: url.origin, username, password, expDate });
            return true;
          }
          return false;
        } catch (error) {
          console.error("Auth Fail:", error);
          return false;
        }
      },
      checkAuth: async () => {
        try {
          const { serverUrl, username, password } = get();
          if (!serverUrl) return;
          const apiUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}`;
          const response = await fetch(apiUrl);
          const data = await response.json();
          if (data?.user_info?.auth === 1) {
            let expDate = null;
            if (data.user_info.exp_date && data.user_info.exp_date !== 'null') {
              const date = new Date(parseInt(data.user_info.exp_date) * 1000);
              expDate = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }
            set({ expDate });
          }
        } catch (error) {
          console.error("Check Auth Fail:", error);
        }
      },
      setProxy: (proxy) => set({ proxy }),
      logout: () => set({ isLoggedIn: false, serverUrl: '', username: '', password: '', proxy: null, expDate: null }),
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
