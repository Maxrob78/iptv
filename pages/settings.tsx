import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useAuthStore, ProxySettings } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';

export default function Settings() {
  const { proxy, setProxy } = useAuthStore();
  const { remoteHubIp, setRemoteHubIp, osEnabled, osApiKey, setOsSettings } = useDataStore();
  const [hubIp, setHubIp] = useState('');
  const [localOsEnabled, setLocalOsEnabled] = useState(false);
  const [localOsApiKey, setLocalOsApiKey] = useState('');
  const [localProxy, setLocalProxy] = useState<ProxySettings>({
    enabled: false,
    host: '',
    port: '',
    username: '',
    password: ''
  });

  useEffect(() => {
    if (proxy) {
      setLocalProxy(proxy);
    }
    setHubIp(remoteHubIp || '');
    setLocalOsEnabled(osEnabled || false);
    setLocalOsApiKey(osApiKey || '');
  }, [proxy, remoteHubIp, osEnabled, osApiKey]);

  const [savedMessage, setSavedMessage] = useState('');

  const handleSave = () => {
    setProxy(localProxy);
    // @ts-ignore
    window.electronAPI?.setProxy?.(localProxy);
    setSavedMessage('Réglages de sécurité enregistrés !');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleSaveHub = () => {
    setRemoteHubIp(hubIp);
    setSavedMessage('Hub configuré ! Reconnexion en cours...');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleSaveOs = () => {
    setOsSettings(localOsEnabled, localOsApiKey);
    if ((window as any).electronAPI && (window as any).electronAPI.setOsSettings) {
      (window as any).electronAPI.setOsSettings({ enabled: localOsEnabled, apiKey: localOsApiKey });
    }
    setSavedMessage('Configuration sous-titres enregistrée !');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  return (
    <div className="flex-1 flex bg-[#141414]">
      <Sidebar />
      <main className="ml-20 lg:ml-64 flex-1 p-12 overflow-y-auto">
        {savedMessage && (
          <div className="fixed bottom-10 right-10 bg-[#b5924d] text-black px-6 py-4 rounded-2xl shadow-2xl font-black uppercase tracking-widest text-[10px] animate-in fade-in slide-in-from-bottom-5 z-[999]">
            {savedMessage}
          </div>
        )}
        <header className="mb-12">
          <div className="flex items-center space-x-3 mb-2">
            <span className="w-1.5 h-8 bg-orange-600 rounded-full" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Paramètres Avancés</span>
          </div>
          <h1 className="text-5xl font-black mb-4 tracking-tighter">Sécurité & VPN</h1>
          <p className="text-gray-400 text-lg font-medium max-w-xl leading-relaxed">
            Configurez un tunnel de protection (Proxy SOCKS5/HTTP) pour masquer votre accès IPTV et contourner les restrictions régionales.
          </p>
        </header>

        <section className="max-w-3xl bg-white/[0.03] border border-white/10 rounded-3xl p-10 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/10 blur-[100px] rounded-full -mr-32 -mt-32 transition-colors group-hover:bg-orange-600/20" />
          
          <div className="flex items-center justify-between mb-10 pb-8 border-b border-white/5 relative z-10">
            <div>
              <h2 className="text-2xl font-black tracking-tight mb-1">Tunnel de protection</h2>
              <p className="text-base text-gray-500 font-medium">Activez cette option pour masquer votre IP réelle.</p>
            </div>
            <button 
              onClick={() => setLocalProxy(p => ({ ...p, enabled: !p.enabled }))}
              className={`w-16 h-9 rounded-full transition-all relative outline-none ring-0 ${localProxy.enabled ? 'bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)]' : 'bg-gray-800'}`}
            >
              <div className={`absolute top-1 left-1 w-7 h-7 bg-white rounded-full transition-transform duration-300 ${localProxy.enabled ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className={`space-y-8 transition-all duration-500 relative z-10 ${localProxy.enabled ? 'opacity-100 scale-100' : 'opacity-30 blur-[2px] pointer-events-none scale-[0.98]'}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] pl-1">Hôte (Serveur ou IP)</label>
                <input 
                  type="text" 
                  value={localProxy.host}
                  onChange={(e) => setLocalProxy(p => ({ ...p, host: e.target.value }))}
                  placeholder="ex: vpn-gate.proxy.net"
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] pl-1">Port</label>
                <input 
                  type="text" 
                  value={localProxy.port}
                  onChange={(e) => setLocalProxy(p => ({ ...p, port: e.target.value }))}
                  placeholder="1080"
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] pl-1">Nom d'utilisateur</label>
                <input 
                  type="text" 
                  value={localProxy.username}
                  onChange={(e) => setLocalProxy(p => ({ ...p, username: e.target.value }))}
                  placeholder="Optionnel"
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] pl-1">Mot de passe</label>
                <input 
                  type="password" 
                  value={localProxy.password}
                  onChange={(e) => setLocalProxy(p => ({ ...p, password: e.target.value }))}
                  placeholder="Optionnel"
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="mt-12 w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-white/90 transition-all active:scale-95 shadow-2xl shadow-white/5 text-lg"
          >
            Appliquer et Sécuriser
          </button>
        </section>

        {/* REMOTE HUB CONFIG (For TV/Multi-device) */}
        <header className="mt-20 mb-12">
          <div className="flex items-center space-x-3 mb-2">
            <span className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Connectivité Multi-écrans</span>
          </div>
          <h1 className="text-5xl font-black mb-4 tracking-tighter">Hub Télécommande</h1>
          <p className="text-gray-400 text-lg font-medium max-w-xl leading-relaxed">
            Pour piloter cette télé depuis votre téléphone, entrez l'adresse IP du PC qui fait office de Hub.
          </p>
        </header>

        <section className="max-w-3xl bg-white/[0.03] border border-white/10 rounded-3xl p-10 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
          <div className="space-y-8 relative z-10">
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] pl-1">IP du PC Hub (ex: 192.168.1.50)</label>
              <input 
                type="text" 
                value={hubIp}
                onChange={(e) => setHubIp(e.target.value)}
                placeholder="Laissez vide pour le mode automatique sur PC"
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              />
            </div>
            
            <button 
              onClick={handleSaveHub}
              className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-500 transition-all active:scale-95 shadow-2xl shadow-blue-900/20 text-lg"
            >
              Lier au Hub
            </button>
          </div>
        </section>

        {/* OPENSUBTITLES CONFIG */}
        <header className="mt-20 mb-12">
          <div className="flex items-center space-x-3 mb-2">
            <span className="w-1.5 h-8 bg-yellow-500 rounded-full" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Sous-titres Automatiques</span>
          </div>
          <h1 className="text-5xl font-black mb-4 tracking-tighter">OpenSubtitles</h1>
          <p className="text-gray-400 text-lg font-medium max-w-xl leading-relaxed">
            Téléchargez automatiquement les sous-titres français lors de la lecture d'un film ou d'une série. Nécessite une clé API gratuite de opensubtitles.com.
          </p>
        </header>

        <section className="max-w-3xl bg-white/[0.03] border border-white/10 rounded-3xl p-10 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-10 pb-8 border-b border-white/5 relative z-10">
            <div>
              <h2 className="text-2xl font-black tracking-tight mb-1">Activer la recherche</h2>
              <p className="text-base text-gray-500 font-medium">Recherche automatique des sous-titres FR via l'API REST.</p>
            </div>
            <button 
              onClick={() => setLocalOsEnabled(!localOsEnabled)}
              className={`w-16 h-9 rounded-full transition-all relative outline-none ring-0 ${localOsEnabled ? 'bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4)]' : 'bg-gray-800'}`}
            >
              <div className={`absolute top-1 left-1 w-7 h-7 bg-white rounded-full transition-transform duration-300 ${localOsEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className={`space-y-8 transition-all duration-500 relative z-10 ${localOsEnabled ? 'opacity-100 scale-100' : 'opacity-30 blur-[2px] pointer-events-none scale-[0.98]'}`}>
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] pl-1">Clé API (REST API Key)</label>
              <input 
                type="text" 
                value={localOsApiKey}
                onChange={(e) => setLocalOsApiKey(e.target.value)}
                placeholder="ex: a1b2c3d4e5f6g7h8..."
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-yellow-500 transition-all font-medium"
              />
              <p className="text-xs text-gray-500 pl-1">
                Obtenez votre clé sur <a href="https://www.opensubtitles.com/" target="_blank" className="text-yellow-500 hover:underline">opensubtitles.com</a> (Consumer).
              </p>
            </div>
            
            <button 
              onClick={handleSaveOs}
              className="w-full bg-yellow-500 text-black font-black py-5 rounded-2xl hover:bg-yellow-400 transition-all active:scale-95 shadow-2xl shadow-yellow-500/20 text-lg"
            >
              Enregistrer
            </button>
          </div>
        </section>

        <section className="mt-16 max-w-2xl bg-orange-600/5 border border-orange-500/10 p-6 rounded-3xl relative">
          <div className="flex gap-4">
             <span className="text-2xl mt-1">🔒</span>
             <p className="text-gray-400 font-medium leading-relaxed italic">
               Note : Pour une sécurité maximale, privilégiez les serveurs au format SOCKS5. Vous pouvez tester votre configuration en vérifiant si les flux mettent plus de temps à se charger : c'est le signe que le tunnel est actif.
             </p>
          </div>
        </section>
      </main>
    </div>
  );
}
