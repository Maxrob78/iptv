import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useDataStore } from '../store/useDataStore';
import { Sidebar } from '../components/Sidebar';
import { FavoriteButton } from '../components/FavoriteButton';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

export default function StudioPage() {
  const router = useRouter();
  const { getProfileData, addLocalItem, removeLocalItem } = useDataStore();
  const { localLibrary } = getProfileData();
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [type, setType] = useState<'movie' | 'series'>('series');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState('8.5');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [tags, setTags] = useState('Chef-d\'œuvre, Exclusif');
  const [cover, setCover] = useState('');
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    setFocus('SIDEBAR');
  }, []);

  if (!mounted) return null;

  const handleSelectImage = async () => {
    // @ts-ignore
    const path = await window.electronAPI?.selectImage?.();
    if (path) setCover(path);
  };

  const handleSelectFiles = async () => {
    // @ts-ignore
    const paths = await window.electronAPI?.selectFiles?.();
    if (paths && paths.length > 0) setFiles(paths);
  };

  const handleSave = () => {
    if (!name || !cover || files.length === 0) return;

    const episodesMap: Record<string, any[]> = {};
    const seasonsList: any[] = [];

    files.forEach((path, idx) => {
      const fileName = path.split(/[\\/]/).pop() || '';
      
      // Pattern detection
      const sMatch = fileName.match(/S(\d+)/i) || fileName.match(/(\d+)x/i) || fileName.match(/Season\s*(\d+)/i);
      let eMatch = fileName.match(/E(\d+)/i) || fileName.match(/x(\d+)/i) || fileName.match(/Episode\s*(\d+)/i);
      
      // Fallback for simple numbering like "1- title" or "01 - title"
      if (!eMatch) {
        const simpleLeadingNumber = fileName.match(/^(\d+)/);
        if (simpleLeadingNumber) eMatch = simpleLeadingNumber;
      }

      const sNum = sMatch ? parseInt(sMatch[1]).toString() : "1";
      const eNum = eMatch ? parseInt(eMatch[1]).toString() : (idx + 1).toString();

      if (!episodesMap[sNum]) {
        episodesMap[sNum] = [];
        seasonsList.push({ season_number: sNum });
      }

      episodesMap[sNum].push({
        id: `local-${Date.now()}-${idx}`,
        title: fileName.split('.')[0],
        path: 'file://' + path.replace(/\\/g, '/'),
        episode_num: eNum,
        container_extension: fileName.split('.').pop() || 'mp4'
      });
    });

    // Sort seasons
    seasonsList.sort((a, b) => parseInt(a.season_number) - parseInt(b.season_number));
    const newItem = {
      id: Date.now().toString(),
      type,
      name,
      description,
      rating,
      year,
      tags: tags.split(',').map(t => t.trim()),
      cover: 'file://' + cover.replace(/\\/g, '/'),
      episodes: type === 'series' ? episodesMap : (episodesMap["1"] || []),
      seasons: type === 'series' ? seasonsList : []
    };

    addLocalItem(newItem);
    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setCover('');
    setFiles([]);
  };

  const getMoviePath = (item: any) => {
    if (Array.isArray(item.episodes)) return item.episodes[0]?.path;
    if (item.episodes["1"]) return item.episodes["1"][0]?.path;
    return '';
  };

  return (
    <div className="flex-1 flex bg-[#050505] min-h-screen text-white font-['Inter'] selection:bg-gold/30">
      <Sidebar />
      <main className="ml-20 lg:ml-72 3xl:ml-96 flex-1">
        
        {/* Atmosphere - Soft Glows */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#b5924d]/5 blur-[200px] rounded-full" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/[0.02] blur-[150px] rounded-full" />
        </div>

        {/* Minimal Hero */}
        <div className="relative pt-32 pb-20 px-20">
            <div className="max-w-4xl animate-in fade-in slide-in-from-left-10 duration-1000">
                <div className="flex items-center space-x-6 mb-12">
                    <div className="w-12 h-[1px] bg-[#b5924d]" />
                    <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d]">Atelier de Création</span>
                </div>
                <h1 className="text-8xl font-extralight tracking-[-0.04em] leading-[0.9] mb-8">
                    VOTRE <br /> <span className="font-italic italic opacity-40">BIBLIOTHÈQUE</span> <br /> PRIVÉE.
                </h1>
                <p className="text-gray-500 text-lg font-light max-w-xl leading-relaxed tracking-wide">
                    Sculptez votre propre expérience médiatique. Importez vos trésors numériques dans un écrin conçu pour l'excellence.
                </p>
            </div>
        </div>

        <div className="px-20 relative z-20 pb-32">
            <div className="flex items-end justify-between mb-16 border-b border-white/[0.05] pb-12">
                <div className="space-y-2">
                    <h2 className="text-xs font-medium uppercase tracking-[0.4em] text-gray-500">Collection Personnelle</h2>
                    <p className="text-3xl font-light tracking-tight">{localLibrary.length} <span className="text-gray-600">Archivages</span></p>
                </div>
                <button 
                  onClick={() => setShowForm(true)}
                  className="group relative overflow-hidden bg-white text-black px-12 py-5 rounded-full font-bold uppercase text-[10px] tracking-[0.3em] transition-all hover:pr-16"
                >
                  <span className="relative z-10">+ Nouveau Contenu</span>
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all">→</span>
                </button>
            </div>

            {/* Grid Luxury Items */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-12">
                {localLibrary.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className="group relative animate-in fade-in slide-in-from-bottom-10 duration-1000"
                      style={{ animationDelay: `${idx * 100}ms` }}
                    >
                        <div className="relative aspect-[3/4.5] rounded-sm overflow-hidden bg-[#0a0a0a] ring-1 ring-white/10 transition-all duration-700 group-hover:ring-white/30 group-hover:shadow-[0_40px_80px_rgba(0,0,0,0.8)]">
                            <img src={item.cover} className="w-full h-full object-cover opacity-80 transition-all duration-1000 group-hover:scale-110 group-hover:opacity-100" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                            
                            <div className="absolute top-4 left-4 z-40">
                                <FavoriteButton item={item} />
                            </div>

                            <div className="absolute inset-0 p-8 flex flex-col justify-end">
                                <span className="text-[#b5924d] text-[8px] font-bold uppercase tracking-[0.3em] mb-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-500">{item.type}</span>
                                <h3 className="text-lg font-light tracking-tight text-white mb-6 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-700 delay-100">{item.name}</h3>
                                <button 
                                    onClick={() => {
                                        if (item.type === 'series') {
                                            router.push(`/series/local-${item.id}`);
                                        } else {
                                            const path = getMoviePath(item);
                                            router.push(`/player/local-${item.id}?type=movie&title=${encodeURIComponent(item.name)}&localPath=${encodeURIComponent(path)}`);
                                        }
                                    }}
                                    className="w-full border border-white/20 text-white text-[9px] font-bold uppercase py-4 rounded-sm backdrop-blur-md hover:bg-white hover:text-black transition-all duration-500 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0"
                                >
                                    Ouvrir les Archives
                                </button>
                            </div>

                            <button 
                                onClick={() => removeLocalItem(item.id)}
                                className="absolute top-6 right-6 w-8 h-8 bg-black/40 border border-white/10 rounded-full flex items-center justify-center text-[10px] hover:bg-white hover:text-black transition-all opacity-0 group-hover:opacity-100"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {localLibrary.length === 0 && (
                <div className="py-40 text-center">
                    <div className="w-[1px] h-20 bg-white/10 mx-auto mb-12" />
                    <p className="text-gray-600 font-light uppercase text-[10px] tracking-[0.6em]">Espace Vierge — Prêt pour Création</p>
                </div>
            )}
        </div>

        {/* MODAL LUXURY FORM */}
        {showForm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050505]/98 backdrop-blur-3xl animate-in fade-in duration-700">
                <div className="w-full max-w-5xl h-screen md:h-auto md:max-h-[90vh] overflow-y-auto px-20 py-24 relative custom-scrollbar">
                    <button onClick={() => setShowForm(false)} className="fixed top-12 right-12 text-sm font-light tracking-[0.4em] text-gray-500 hover:text-white transition-all uppercase">Quitter ✕</button>
                    
                    <div className="mb-24 text-center">
                        <span className="text-[10px] font-medium uppercase tracking-[0.8em] text-[#b5924d] block mb-6">Nouveau Registre</span>
                        <h2 className="text-6xl font-extralight tracking-tight italic">Manifeste du Projet</h2>
                    </div>

                    <div className="grid grid-cols-12 gap-20">
                        {/* Infos Section */}
                        <div className="col-span-12 lg:col-span-7 space-y-16">
                            <div className="grid grid-cols-2 gap-12">
                                <div className="space-y-4">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block">Classification</label>
                                    <div className="flex border-b border-white/10 pb-2">
                                        <button onClick={() => setType('movie')} className={`mr-10 text-[10px] font-bold tracking-[0.2em] transition-all ${type === 'movie' ? 'text-[#b5924d]' : 'text-gray-700 hover:text-gray-400'}`}>FILM</button>
                                        <button onClick={() => setType('series')} className={`text-[10px] font-bold tracking-[0.2em] transition-all ${type === 'series' ? 'text-[#b5924d]' : 'text-gray-700 hover:text-gray-400'}`}>SÉRIE</button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block">Désignation</label>
                                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Titre de l'œuvre" className="w-full bg-transparent border-b border-white/10 py-2 text-xl font-light focus:border-[#b5924d] outline-none transition-all placeholder:text-gray-800" />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block">Synopsis</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Narratif du contenu..." className="w-full bg-transparent border-b border-white/10 py-2 text-lg font-light focus:border-[#b5924d] outline-none transition-all placeholder:text-gray-800 resize-none" />
                            </div>

                            <div className="grid grid-cols-3 gap-12">
                                <div className="space-y-4">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block">Cote / 10</label>
                                    <input value={rating} onChange={e => setRating(e.target.value)} type="number" className="w-full bg-transparent border-b border-white/10 py-2 text-lg font-light outline-none focus:border-[#b5924d]" />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block">Ère</label>
                                    <input value={year} onChange={e => setYear(e.target.value)} type="number" className="w-full bg-transparent border-b border-white/10 py-2 text-lg font-light outline-none focus:border-[#b5924d]" />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block">Attributs</label>
                                    <input value={tags} onChange={e => setTags(e.target.value)} className="w-full bg-transparent border-b border-white/10 py-2 text-sm font-light outline-none focus:border-[#b5924d]" />
                                </div>
                            </div>
                        </div>

                        {/* Visuals Section */}
                        <div className="col-span-12 lg:col-span-5 space-y-12">
                            <div className="space-y-6">
                                <label className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500 block text-center">Esthétique (Cover)</label>
                                <div 
                                  onClick={handleSelectImage}
                                  className="aspect-[3/4.2] w-64 mx-auto border border-white/5 rounded-sm flex flex-col items-center justify-center cursor-pointer hover:border-[#b5924d]/40 transition-all overflow-hidden relative group/cover bg-white/[0.02]"
                                >
                                    {cover ? (
                                        <img src={'file://' + cover.replace(/\\/g, '/')} className="w-full h-full object-cover transition-opacity duration-700 group-hover/cover:opacity-40" />
                                    ) : (
                                        <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-600">Sélecteur</span>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 py-6 bg-black/60 translate-y-full group-hover/cover:translate-y-0 transition-transform">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-center">Modifier l'Image</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 pt-10">
                                <button 
                                  onClick={handleSelectFiles}
                                  className="w-full border border-[#b5924d]/40 text-[#b5924d] py-6 rounded-full font-bold text-[10px] tracking-[0.3em] uppercase hover:bg-[#b5924d] hover:text-black transition-all"
                                >
                                    {files.length > 0 ? `${files.length} Éléments Indexés` : 'Indexer les Fichiers'}
                                </button>
                                
                                {files.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto px-4 custom-scrollbar">
                                        {files.map((f, i) => (
                                            <p key={i} className="text-[8px] text-gray-600 truncate py-1 border-b border-white/[0.03] uppercase tracking-tighter italic">{f.split(/[\\/]/).pop()}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-32 text-center pb-20">
                        <button 
                            onClick={handleSave}
                            className="group bg-[#111] border border-white/20 text-white px-20 py-8 rounded-full font-bold uppercase text-[11px] tracking-[0.6em] transition-all hover:bg-white hover:text-black hover:px-24"
                        >
                            Finaliser l'Archivage
                        </button>
                    </div>
                </div>
            </div>
        )}

        <style jsx>{`
            .custom-scrollbar::-webkit-scrollbar { width: 2px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(181, 146, 77, 0.2); }
        `}</style>
      </main>
    </div>
  );
}
