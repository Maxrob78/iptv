import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const login = useAuthStore.getState().login;
    const success = await login(url, user, pass);
    if (success) {
      router.push('/profiles');
    } else {
      setError('Identifiants incorrects ou serveur injoignable.');
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex-1 flex items-center justify-center bg-[#141414]">
      <div className="bg-black/60 p-16 rounded-2xl backdrop-blur-xl border border-white/5 shadow-2xl z-10 w-full max-w-md">
        <h1 className="text-4xl font-black mb-8 text-white tracking-tighter">S'identifier</h1>
        
        {error && <div className="bg-orange-500/20 text-orange-400 border border-orange-500/30 p-4 rounded-xl mb-6 text-sm italic">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
             <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Serveur Xtream</label>
             <input 
               type="text" 
               placeholder="http://iptv-server.com:8080" 
               className="w-full bg-[#333] text-white px-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-gray-500"
               value={url}
               onChange={(e) => setUrl(e.target.value)}
               required
             />
          </div>
          <div className="space-y-2">
             <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Utilisateur</label>
             <input 
                type="text" 
                placeholder="Votre nom d'utilisateur" 
                className="w-full bg-[#333] text-white px-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-gray-500"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
              />
          </div>
          <div className="space-y-2">
             <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Mot de passe</label>
             <input 
                type="password" 
                placeholder="••••••••" 
                className="w-full bg-[#333] text-white px-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-gray-500"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
              />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-white hover:bg-white/90 text-black font-black py-4 rounded-xl transition-all disabled:opacity-50 mt-4 active:scale-95 shadow-xl shadow-white/5 text-lg"
          >
            {loading ? 'Vérification...' : "Connexion Platinum"}
          </button>
        </form>
      </div>
    </div>
  );
}
