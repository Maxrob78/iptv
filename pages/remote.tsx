import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Sidebar } from '../components/Sidebar';
import { useDataStore } from '../store/useDataStore';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

export default function RemotePage() {
  const [localIp, setLocalIp] = useState<string>('');
  const [port, setPort] = useState<number>(3008);
  const { remoteHubIp } = useDataStore();

  useEffect(() => {
    const getInfo = async () => {
      try {
        if ((window as any).electronAPI?.getRemoteInfo) {
          const info = await (window as any).electronAPI.getRemoteInfo();
          setLocalIp(info.ip || '192.168.x.x');
          setPort(info.port || 3008);
        } else {
          setLocalIp(remoteHubIp || '192.168.x.x');
        }
      } catch (e) {
        setLocalIp('192.168.x.x');
      }
    };
    getInfo();
  }, [remoteHubIp]);

  const { ref, focusKey } = useFocusable({
    focusKey: 'REMOTE_PAGE',
  });

  useEffect(() => {
    // Il n'y a pas de boutons sur cette page, donc on remet le focus sur la barre latérale 
    // pour ne pas bloquer l'utilisateur à la télécommande.
    setFocus('SIDEBAR');
  }, []);

  // L'URL de l'application télécommande (port 3008 configuré dans main.js)
  const remoteUrl = `http://${localIp}:${port}/`;

  return (
    <div className="flex-1 flex bg-[#141414] min-h-screen">
      <Sidebar />
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="ml-20 lg:ml-64 flex-1 p-12 overflow-y-auto">
          <header className="mb-12">
            <div className="flex items-center space-x-3 mb-2">
              <span className="w-1.5 h-8 bg-[#b5924d] rounded-full shadow-[0_0_10px_#b5924d]" />
              <span className="text-xs font-black uppercase tracking-[0.3em] text-[#b5924d] opacity-80">Connectivité</span>
            </div>
            <h1 className="text-5xl font-black mb-4 tracking-tighter text-white">Télécommande Mobile</h1>
            <p className="text-gray-400 text-lg font-medium max-w-xl leading-relaxed">
              Contrôlez Platinum Media Center depuis votre smartphone. Scannez le QR Code pour lancer l'application télécommande.
            </p>
          </header>

          <div className="flex flex-col md:flex-row gap-12 items-start mt-16">
            
            {/* Section QR Code */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-10 backdrop-blur-xl flex flex-col items-center justify-center shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-[#b5924d]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              
              <div className="bg-white p-6 rounded-2xl shadow-2xl relative z-10 transform transition-transform duration-500 hover:scale-105">
                <QRCodeSVG 
                  value={remoteUrl} 
                  size={200} 
                  bgColor={"#ffffff"} 
                  fgColor={"#000000"} 
                  level={"H"} 
                  includeMargin={false} 
                />
              </div>
              
              <p className="mt-8 text-sm font-bold text-gray-400 tracking-[0.2em] uppercase">
                IP: <span className="text-white">{localIp}</span>
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-8 max-w-lg pt-4">
              <div className="flex items-start space-x-6">
                <div className="w-12 h-12 rounded-full bg-[#b5924d]/20 border border-[#b5924d]/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-black text-[#b5924d]">1</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Connectez-vous au Wi-Fi</h3>
                  <p className="text-gray-400 leading-relaxed">
                    Assurez-vous que votre smartphone est connecté sur le même réseau Wi-Fi que cet appareil.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-6">
                <div className="w-12 h-12 rounded-full bg-[#b5924d]/20 border border-[#b5924d]/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-black text-[#b5924d]">2</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Scannez le QR Code</h3>
                  <p className="text-gray-400 leading-relaxed">
                    Ouvrez l'appareil photo de votre téléphone et pointez-le vers le QR Code à l'écran.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-6">
                <div className="w-12 h-12 rounded-full bg-[#b5924d]/20 border border-[#b5924d]/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-black text-[#b5924d]">3</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Prenez le contrôle</h3>
                  <p className="text-gray-400 leading-relaxed">
                    La web-app s'ouvrira instantanément. Vous pourrez naviguer, lire des vidéos et régler le volume sans aucune installation.
                  </p>
                </div>
              </div>
              
            </div>
          </div>
        </main>
      </FocusContext.Provider>
    </div>
  );
}
