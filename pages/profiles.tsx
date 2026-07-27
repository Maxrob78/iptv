import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useProfileStore, Profile } from '../store/useProfileStore';
import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';

// Avatars locaux + backup Dicebear
const DICEBEAR_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna'
];

// Flag global pour savoir si on utilise la souris ou la télécommande
let isMouseActive = false;
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', () => { isMouseActive = true; });
  window.addEventListener('keydown', () => { isMouseActive = false; });
}

export default function ProfilesPage() {
  const router = useRouter();
  const { profiles, addProfile, removeProfile, updateProfile, setActiveProfile } = useProfileStore();
  const { migrateToProfile, removeProfileData } = useDataStore();
  const [categories, setCategories] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(DICEBEAR_AVATARS[0]);

  // Auth Change States
  const { serverUrl, username, password, login } = useAuthStore();
  const [isChangingAuth, setIsChangingAuth] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (isChangingAuth) {
      setNewUrl(serverUrl);
      setNewUser(username);
      setNewPass(password);
      setAuthError('');
    }
  }, [isChangingAuth, serverUrl, username, password]);

  useEffect(() => {
    // Chargement dynamique des avatars par catégories via Electron (compatible Prod)
    const loadAvatars = async () => {
      try {
        const data = await (window as any).electronAPI?.invoke?.('get-avatars');
        if (Array.isArray(data)) {
          // On ajoute Dicebear comme une catégorie à la fin
          const allCategories = [
            ...data,
            { name: 'Par Défaut', images: DICEBEAR_AVATARS }
          ];
          setCategories(allCategories);
          if (allCategories[0]?.images?.length > 0) {
            setSelectedAvatar(allCategories[0].images[0]);
          }
        }
      } catch (err) {
        console.error('Erreur avatars IPC:', err);
      }
    };

    loadAvatars();
  }, []);

  const { ref, focusKey } = useFocusable({
    focusKey: 'PROFILES_SCREEN'
  });

  useEffect(() => {
    if (isAdding) {
      (window as any).lastAvatarFocusKey = null;
    }
  }, [isAdding]);

  const getAvatarFocusTarget = () => {
    if ((window as any).lastAvatarFocusKey) return (window as any).lastAvatarFocusKey;
    for (let c = 0; c < categories.length; c++) {
      const idx = categories[c].images.indexOf(selectedAvatar);
      if (idx !== -1) return `AVATAR_OPT_${c}_${idx}`;
    }
    return 'AVATAR_OPT_0_0';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si on est en train d'ajouter/modifier un profil et qu'on appuie sur Escape ou Backspace
      if ((e.key === 'Escape' || e.key === 'Backspace') && isAdding) {
        // On vérifie si un input est actif, pour ne pas fermer le menu quand on efface du texte
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          if (e.key === 'Backspace') return; // Laisse l'utilisateur effacer son texte
          if (e.key === 'Escape') (active as HTMLElement).blur(); // Quitte l'input
        }
        
        // Quitte le mode d'ajout et revient au menu
        e.preventDefault();
        e.stopPropagation(); // Empêche Norigin de traiter cet Escape
        setIsAdding(false);
        setEditingProfileId(null);
        setNewName('');
      } else if ((e.key === 'Escape' || e.key === 'Backspace') && isChangingAuth) {
        // Quitte le mode auth
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          if (e.key === 'Backspace') return;
          if (e.key === 'Escape') (active as HTMLElement).blur();
        }
        e.preventDefault();
        e.stopPropagation();
        setIsChangingAuth(false);
      } else if ((e.key === 'Escape' || e.key === 'Backspace') && !isAdding && isManaging) {
         // Quitte le mode gestion
         e.preventDefault();
         e.stopPropagation(); // Empêche Norigin de traiter cet Escape
         setIsManaging(false);
         setTimeout(() => {
           if (profiles.length > 0) setFocus(`PROFILE_CARD_${profiles[0].id}`);
         }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isAdding, isManaging, isChangingAuth]);

  useEffect(() => {
    // Si aucun profil n'existe, on force l'ajout du premier
    if (profiles.length === 0 && !isAdding) {
      setIsAdding(true);
    }
    
    // Petit délai pour laisser le temps au DOM de se construire avant de donner le focus
    setTimeout(() => {
      if (isAdding) {
        setFocus('PROFILE_NAME_INPUT');
      } else if (profiles.length > 0) {
        setFocus(`PROFILE_CARD_${profiles[0].id}`);
      } else {
        setFocus('PROFILE_ADD_BUTTON');
      }
    }, 150);
  }, [profiles.length, isAdding]);

  const handleSelect = (profile: Profile) => {
    if (isManaging) {
        // En mode gestion, cliquer sur un profil ouvre l'édition
        setNewName(profile.name);
        setSelectedAvatar(profile.avatar);
        setEditingProfileId(profile.id);
        setIsAdding(true);
        return;
    }
    migrateToProfile(profile.id);
    setActiveProfile(profile);
    router.push('/');
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      removeProfile(deleteConfirm);
      removeProfileData(deleteConfirm);
      setDeleteConfirm(null);
      setIsAdding(false);
      
      // Wait for profiles to update
      setTimeout(() => {
        const remainingProfiles = useProfileStore.getState().profiles;
        if (remainingProfiles.length > 0) {
          setFocus(`PROFILE_CARD_${remainingProfiles[0].id}`);
        } else {
          setFocus('PROFILE_ADD_BUTTON');
        }
      }, 150);
    }
  };

  const handleSave = () => {
    if (newName.trim()) {
      if (editingProfileId) {
        updateProfile(editingProfileId, newName, selectedAvatar);
      } else {
        addProfile(newName, selectedAvatar);
      }
      setNewName('');
      setEditingProfileId(null);
      setIsAdding(false);
    }
  };

  const handleSaveAuth = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const success = await login(newUrl, newUser, newPass);
    if (success) {
      setIsChangingAuth(false);
    } else {
      setAuthError('Identifiants incorrects ou serveur injoignable.');
    }
    setAuthLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center font-['Inter']">
      <FocusContext.Provider value={focusKey}>
        <main ref={ref} className="w-full max-w-6xl px-10">

          {!isAdding && !isChangingAuth ? (
            <div className="w-full">
              <h1 className="text-5xl font-extralight tracking-tight text-center mb-20 opacity-90">
                {isManaging ? 'Gérer les profils' : 'Qui regarde ?'}
              </h1>

              <div className="flex flex-wrap justify-center gap-12 mb-20">
                {profiles.map((p) => (
                  <FocusableProfileCard
                    key={p.id}
                    profile={p}
                    isManaging={isManaging}
                    onSelect={() => handleSelect(p)}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}

                {!isManaging && (
                  <FocusableAddButton onClick={() => setIsAdding(true)} />
                )}
              </div>

              <div className="flex justify-center space-x-6">
                <FocusableButton
                  focusKey="BTN_GERER_PROFILS"
                  label={isManaging ? 'Terminer' : 'Gérer les profils'}
                  onClick={() => setIsManaging(!isManaging)}
                />
                {!isManaging && (
                  <FocusableButton
                    label="⚙️ Changer d'identifiants"
                    onClick={() => setIsChangingAuth(true)}
                  />
                )}
              </div>

            </div>
          ) : isChangingAuth ? (
            <div className="max-w-2xl mx-auto w-full bg-[#111] p-16 rounded-2xl border border-white/5 shadow-2xl">
              <h1 className="text-4xl font-black mb-8 text-white tracking-tighter text-center">Modifier Identifiants</h1>
              
              {authError && <div className="bg-orange-500/20 text-orange-400 border border-orange-500/30 p-4 rounded-xl mb-6 text-sm italic">{authError}</div>}

              <form onSubmit={handleSaveAuth} className="space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Serveur Xtream</label>
                   <FocusableInput 
                     focusKey="AUTH_URL_INPUT"
                     value={newUrl}
                     onChange={setNewUrl}
                     placeholder="http://..."
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Utilisateur</label>
                   <FocusableInput 
                     focusKey="AUTH_USER_INPUT"
                     value={newUser}
                     onChange={setNewUser}
                     placeholder="Identifiant"
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Mot de passe</label>
                   <div className="relative">
                     <FocusableInput 
                       focusKey="AUTH_PASS_INPUT"
                       type="text"
                       value={newPass}
                       onChange={setNewPass}
                       placeholder="Mot de passe"
                     />
                   </div>
                </div>

                <div className="flex space-x-4 mt-8">
                  <div className="w-1/3">
                    <FocusableButton 
                      focusKey="AUTH_CANCEL_BTN"
                      label="Annuler"
                      onClick={() => setIsChangingAuth(false)}
                    />
                  </div>
                  <div className="w-2/3">
                    <FocusableButton 
                      focusKey="AUTH_SAVE_BTN"
                      primary
                      label={authLoading ? 'Vérification...' : "Enregistrer"}
                      onClick={handleSaveAuth}
                    />
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-10 duration-300 max-w-5xl mx-auto w-full">
              <h1 className="text-4xl font-extralight tracking-[0.2em] mb-12 text-center uppercase opacity-50">
                  {editingProfileId ? 'Modifier le Profil' : 'Nouveau Profil'}
              </h1>

              <div className="bg-white/[0.03] border border-white/10 rounded-sm backdrop-blur-3xl overflow-hidden flex flex-col md:flex-row">
                {/* PARTIE GAUCHE : APERÇU */}
                <div className="w-full md:w-80 bg-white/[0.02] p-12 flex flex-col items-center justify-center border-r border-white/5">
                  <div className="relative group mb-10 flex-shrink-0 w-56 h-56">
                    <div className="absolute inset-0 bg-[#b5924d]/20 rounded-full blur-3xl group-hover:bg-[#b5924d]/30 transition-all duration-500"></div>
                    <img 
                      key={selectedAvatar}
                      src={selectedAvatar} 
                      loading="lazy" 
                      decoding="async" 
                      className="w-56 h-56 flex-shrink-0 rounded-full border-4 border-[#b5924d] p-1.5 bg-black/40 object-cover relative z-10 shadow-[0_0_80px_rgba(181,146,77,0.4)] animate-in zoom-in-75 duration-500" 
                      alt="" 
                    />
                  </div>
                  
                  <div className="w-full space-y-4">
                    <label className="text-[10px] uppercase tracking-[0.4em] opacity-40 block text-center">Nom du Profil</label>
                    <FocusableInput 
                      focusKey="PROFILE_NAME_INPUT"
                      value={newName}
                      onChange={setNewName}
                      placeholder="Ex: Maxence"
                      onArrowPress={(direction: string) => {
                        if (direction === 'up') return false;
                        if (direction === 'down') {
                          setFocus(editingProfileId ? 'BTN_ENREGISTRER' : 'BTN_CRÉER');
                          return false;
                        }
                        if (direction === 'right') {
                          setFocus(getAvatarFocusTarget());
                          return false; // prevent default spatial navigation
                        }
                        return true;
                      }}
                    />
                  </div>
                </div>

                {/* PARTIE DROITE : CHOIX DES AVATARS */}
                <div className="flex-1 p-10 flex flex-col">
                  <h2 className="text-[10px] uppercase tracking-[0.3em] text-[#b5924d] mb-8 font-black">Choisir un avatar</h2>
                  
                  <FocusableAvatarList 
                    categories={categories}
                    selectedAvatar={selectedAvatar}
                    setSelectedAvatar={setSelectedAvatar}
                    editingProfileId={editingProfileId}
                  />

                  <div className="flex space-x-4 pt-10 mt-auto">
                    <FocusableButton 
                      label={editingProfileId ? "Enregistrer" : "Créer"} 
                      primary 
                      onClick={handleSave} 
                      onArrowPress={(direction: string) => {
                        if (direction === 'up') {
                          setFocus(getAvatarFocusTarget());
                          return false;
                        }
                        if (direction === 'down') return false;
                        return true;
                      }}
                    />
                    <FocusableButton 
                      label="Annuler" 
                      onClick={() => {
                          setIsAdding(false);
                          setEditingProfileId(null);
                          setNewName('');
                      }} 
                      onArrowPress={(direction: string) => {
                        if (direction === 'up') {
                          setFocus(getAvatarFocusTarget());
                          return false;
                        }
                        if (direction === 'down') return false;
                        return true;
                      }}
                    />
                    {editingProfileId && (
                      <FocusableButton 
                        label="Supprimer" 
                        onClick={() => handleDelete(editingProfileId)} 
                        danger
                        onArrowPress={(direction: string) => {
                          if (direction === 'up') {
                            setFocus(getAvatarFocusTarget());
                            return false;
                          }
                          if (direction === 'down') return false;
                          return true;
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modale de Confirmation de suppression */}
          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center animate-in fade-in duration-300">
                <div className="bg-[#111] border border-white/10 p-12 rounded-sm max-w-lg w-full space-y-10 shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="text-center space-y-4">
                        <h2 className="text-3xl font-light">Supprimer le profil ?</h2>
                        <p className="text-gray-500 font-light leading-relaxed">
                            Toutes les données (favoris, historique) de ce profil seront définitivement effacées.
                        </p>
                    </div>
                    
                    <div className="flex space-x-4">
                        <FocusableButton 
                            label="Supprimer" 
                            primary 
                            onClick={confirmDelete} 
                        />
                        <FocusableButton 
                            label="Annuler" 
                            onClick={() => setDeleteConfirm(null)} 
                        />
                    </div>
                </div>
            </div>
          )}
        </main>
      </FocusContext.Provider>
    </div>
  );
}

function FocusableProfileCard({ profile, isManaging, onSelect, onDelete }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: `PROFILE_CARD_${profile.id}`,
    onEnterPress: onSelect
  });

  return (
    <div 
      ref={ref}
      onClick={onSelect}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus(focusKey);
        }
      }}
      className="flex flex-col items-center space-y-6 group cursor-pointer relative"
    >
      <div className={`w-44 h-44 rounded-sm overflow-hidden transition-all duration-200 ring-offset-8 ring-offset-[#050505]
                     ${focused ? 'ring-4 ring-white scale-110 shadow-[0_0_50px_rgba(255,255,255,0.2)] opacity-100' : (isManaging ? 'ring-2 ring-white/20 opacity-100 scale-100' : 'ring-0 opacity-80 scale-100')}`}>
        <img src={profile.avatar} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="" />
      </div>
      <span className={`text-xl font-light tracking-wide transition-all ${focused ? 'text-white translate-y-2' : 'text-gray-500'}`}>
        {profile.name}
      </span>
    </div>
  );
}

function FocusableAddButton({ onClick }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: 'PROFILE_ADD_BUTTON',
    onEnterPress: onClick
  });

  return (
    <div 
      ref={ref}
      onClick={onClick}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus(focusKey);
        }
      }}
      className="flex flex-col items-center space-y-6 group cursor-pointer"
    >
      <div className={`w-44 h-44 rounded-sm border-2 border-dashed flex items-center justify-center transition-all duration-200
                     ${focused ? 'bg-white/10 border-white scale-110 opacity-100' : 'border-white/10 opacity-30 scale-100'}`}>
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4v16m8-8H4" /></svg>
      </div>
      <span className={`text-xl font-light tracking-wide transition-all ${focused ? 'text-white translate-y-2' : 'text-gray-500'}`}>
        Ajouter
      </span>
    </div>
  );
}

function FocusableDummyBottom({ targetKey }: any) {
  const { ref } = useFocusable({
    onFocus: () => setFocus(targetKey),
    onArrowPress: () => false
  });
  return <div ref={ref} className="h-1 w-full" />;
}

function FocusableAvatarList({ categories, selectedAvatar, setSelectedAvatar, editingProfileId }: any) {
  return (
    <div 
      className="space-y-12 max-h-[50vh] overflow-y-auto no-scrollbar px-2 py-4"
    >
        {categories.map((cat: any, catIdx: number) => (
          <div key={cat.name} className="space-y-4">
            <label className="text-[9px] uppercase tracking-[0.3em] text-[#b5924d] opacity-60">{cat.name}</label>
            <div className="flex flex-wrap gap-4">
              {cat.images.map((url: string, imgIdx: number) => (
                <FocusableAvatarOption
                  key={`${catIdx}-${imgIdx}`}
                  url={url}
                  catIdx={catIdx}
                  imgIdx={imgIdx}
                  isActive={selectedAvatar === url}
                  onSelect={() => setSelectedAvatar(url)}
                />
              ))}
            </div>
          </div>
        ))}
        <FocusableDummyBottom targetKey={editingProfileId ? 'BTN_ENREGISTRER' : 'BTN_CRÉER'} />
      </div>
  );
}

function FocusableAvatarOption({ url, catIdx, imgIdx, isActive, onSelect, onArrowPress }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: `AVATAR_OPT_${catIdx}_${imgIdx}`,
    onEnterPress: onSelect,
    onArrowPress,
    onFocus: () => {
      (window as any).lastAvatarFocusKey = `AVATAR_OPT_${catIdx}_${imgIdx}`;
      if (ref.current && !isMouseActive) {
        ref.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
    }
  });

  useEffect(() => {
    if (isActive && ref.current) {
      // Met la liste directement sur l'avatar actif à l'ouverture
      ref.current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div 
      ref={ref}
      onClick={onSelect}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus(focusKey);
        }
      }}
      className={`w-28 h-28 rounded-full overflow-hidden cursor-pointer transition-all border-4 
                 ${isActive ? 'border-[#b5924d] shadow-[0_0_30px_rgba(181,146,77,0.3)]' : 'border-transparent'}
                 ${focused ? 'ring-4 ring-white z-10 shadow-2xl' : ''}
                 ${(isActive || focused) ? 'opacity-100 scale-110' : 'opacity-80 hover:opacity-100 scale-100'}`}
    >
      <img src={url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="" />
    </div>
  );
}

function FocusableButton({ label, primary, danger, onClick, onArrowPress, focusKey: customFocusKey }: any) {
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey || `BTN_${label.replace(/\s+/g, '_').toUpperCase()}`,
    onEnterPress: onClick,
    onArrowPress
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus(focusKey);
        }
      }}
      className={`flex-1 py-4 rounded-sm text-[10px] font-bold uppercase tracking-[0.4em] transition-all outline-none focus:outline-none border-none
                 ${danger 
                    ? (focused ? 'bg-red-600 text-white scale-105' : 'bg-red-600/20 text-red-500')
                    : (primary
                        ? (focused ? 'bg-white text-black scale-105' : 'bg-[#b5924d] text-black')
                        : (focused ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40'))}`}
    >
      {label}
    </button>
  );
}

function FocusableInput({ value, onChange, placeholder, type = 'text', focusKey: customFocusKey, onArrowPress }: any) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { ref, focused, focusKey } = useFocusable({
    focusKey: customFocusKey,
    onArrowPress,
    onFocus: () => {
      if (!isMouseActive) {
        window.scrollTo({ top: 0, behavior: 'auto' });
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    onEnterPress: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    onBlur: () => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }
  });

  return (
    <div ref={ref} className="w-full" onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          setFocus(focusKey);
        }
      }}>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
           if (e.key === 'Enter') {
              inputRef.current?.blur();
           }
        }}
        className={`w-full bg-black/40 border-b py-4 px-2 text-2xl font-light focus:outline-none outline-none transition-all
                   ${focused ? 'border-[#b5924d] bg-white/5' : 'border-white/10'}`}
        placeholder={placeholder}
      />
    </div>
  );
}
