import React, { useEffect, useState } from 'react';
import { useFocusable, FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { tmdbApi, TMDBMovie } from '../utils/tmdb';
import { useDataStore } from '../store/useDataStore';
import { useRouter } from 'next/router';
import FavoriteModal from './FavoriteModal';

export function ActorModal({ actorName, onClose }: { actorName: string, onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [movies, setMovies] = useState<any[]>([]);
  const router = useRouter();

  const { ref, focusKey } = useFocusable({
    focusKey: 'ACTOR_MODAL',
    isFocusBoundary: true,
    autoRestoreFocus: true,
    onArrowPress: (direction) => {
      if (direction === 'down' || direction === 'up') return true;
      return true;
    }
  });

  const handleClose = () => {
    // Restaurer le focus manuellement si le système auto échoue
    setFocus(`ACTOR_BADGE_${actorName.replace(/[^a-zA-Z0-9]/g, '_')}`);
    // Petit délai pour s'assurer que le focus est envoyé avant la destruction
    setTimeout(onClose, 10);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  const { ref: closeRef, focused: closeFocused } = useFocusable({
    focusKey: 'ACTOR_MODAL_CLOSE',
    onEnterPress: handleClose,
    onArrowPress: (direction) => {
      if (direction === 'down') {
        if (movies.length > 0) {
          setTimeout(() => setFocus('ACTOR_MOVIE_0'), 10);
        }
        return false;
      }
      if (direction === 'up' || direction === 'left' || direction === 'right') {
        return false;
      }
      return true;
    }
  });

  // Nettoyer les noms IPTV (ex: "AR| Inception", "EN| ", "(2010)", "4K")
  const cleanTitle = (title: string) => {
    if (!title) return '';
    return title
      .replace(/^([A-Z]{2,3}(\s)?\|)\s*/i, '') // Remove AR|, EN | etc.
      .replace(/\s*\(\d{4}\)/g, '') // Remove (2010)
      .replace(/\s+(4K|UHD|FHD|HD|1080p|720p|VOD|FR|VOSTFR|MULTI|VF)$/ig, '')
      .replace(/\[.*?\]/g, '') // Remove [1080p]
      .trim()
      .toLowerCase();
  };

  useEffect(() => {
    const fetchActorMovies = async () => {
      setLoading(true);
      
      const personId = await tmdbApi.searchPerson(actorName);
      if (!personId) {
        setMovies([]);
        setLoading(false);
        setTimeout(() => setFocus('ACTOR_MODAL_CLOSE'), 100);
        return;
      }

      const tmdbMovies = await tmdbApi.getPersonMovies(personId);
      const tmdbTitles = new Set(tmdbMovies.map(m => cleanTitle(m.title)));
      const tmdbOriginals = new Set(tmdbMovies.map(m => cleanTitle(m.original_title)));

      const allIptvMovies = useDataStore.getState().movies;
      
      const matchedIptvMovies = allIptvMovies.filter(iptvMovie => {
        const cleanIptvName = cleanTitle(iptvMovie.name || iptvMovie.title);
        return tmdbTitles.has(cleanIptvName) || tmdbOriginals.has(cleanIptvName);
      });

      setMovies(matchedIptvMovies);
      setLoading(false);
      setTimeout(() => {
        if (matchedIptvMovies.length > 0) {
          setFocus(`ACTOR_MOVIE_0`);
        } else {
          setFocus('ACTOR_MODAL_CLOSE');
        }
      }, 100);
    };

    fetchActorMovies();
  }, [actorName]);

  const [favModalItem, setFavModalItem] = useState<any>(null);

  const handleMovieClick = (movie: any) => {
    handleClose();
    setTimeout(() => router.push(`/movie/${movie.stream_id || movie.id}`), 50);
  };

  const handleMovieLongPress = (movie: any) => {
    setFavModalItem(movie);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div role="dialog" className="fixed inset-0 z-[200] flex items-center justify-center p-10 animate-in fade-in duration-300">
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={handleClose} />
        
        <div ref={ref} className="relative z-10 w-full max-w-6xl bg-[#0a0a0a] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          
          <div className="p-10 border-b border-white/10 flex justify-between items-center bg-gradient-to-b from-white/5 to-transparent">
            <div>
              <h2 className="text-3xl font-light mb-2">Filmographie : <span className="font-bold">{actorName}</span></h2>
              <p className="text-sm text-gray-400 uppercase tracking-widest">
                {loading ? 'Recherche en cours...' : `${movies.length} oeuvre(s) disponible(s) dans votre catalogue`}
              </p>
            </div>
            <button
              ref={closeRef}
              onClick={handleClose}
              onMouseEnter={(e: any) => {
                if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
                  (window as any).lastMouseX = e.clientX;
                  (window as any).lastMouseY = e.clientY;
                  setFocus('ACTOR_MODAL_CLOSE');
                }
              }}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${
                closeFocused ? 'bg-white text-black scale-110 shadow-[0_0_20px_rgba(255,255,255,0.5)]' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 no-scrollbar">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="w-12 h-12 border-4 border-[#b5924d] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : movies.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {movies.map((movie, idx) => (
                  <ActorMovieCard 
                    key={`${movie.stream_id}-${idx}`} 
                    movie={movie} 
                    index={idx}
                    onClick={() => handleMovieClick(movie)}
                    onLongPress={() => handleMovieLongPress(movie)}
                    onArrowPress={(dir) => {
                      if (dir === 'up' && idx < 5) {
                        setFocus('ACTOR_MODAL_CLOSE');
                        return false;
                      }
                      return true;
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <span className="text-6xl mb-6">🎭</span>
                <h3 className="text-xl font-medium mb-2">Aucun film trouvé</h3>
                <p className="text-gray-500 max-w-md">
                  Nous n'avons trouvé aucun film correspondant à cet acteur dans votre catalogue actuel.
                </p>
              </div>
            )}
          </div>
        </div>

        {favModalItem && (
          <FavoriteModal 
            item={favModalItem} 
            onClose={() => {
              setFavModalItem(null);
              setFocus(`ACTOR_MOVIE_${movies.findIndex(m => m.stream_id === favModalItem.stream_id || m.id === favModalItem.id)}`);
            }} 
          />
        )}
      </div>
    </FocusContext.Provider>
  );
}

function ActorMovieCard({ movie, index, onClick, onArrowPress, onLongPress }: { movie: any, index: number, onClick: () => void, onArrowPress?: (dir: string) => boolean, onLongPress?: () => void }) {
  const pressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = React.useRef(false);
  const lastFocusTime = React.useRef(0);

  const { ref, focused, focusKey } = useFocusable({
    focusKey: `ACTOR_MOVIE_${index}`,
    onArrowPress,
    onFocus: () => {
      lastFocusTime.current = Date.now();
      longPressTriggered.current = false;
      if (!(window as any).isMouseFocus) {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      ref.current?.focus();
    },
    onBlur: () => {
      ref.current?.blur();
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      longPressTriggered.current = false;
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (Date.now() - lastFocusTime.current < 500) return;
      if (pressTimer.current) return;

      longPressTriggered.current = false;
      pressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        if (onLongPress) onLongPress();
      }, 800);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
        if (!longPressTriggered.current) {
          onClick();
        }
      }
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onClick={(e) => {
        if (e.detail > 0) onClick();
      }}
      onMouseEnter={(e: any) => {
        if ((window as any).lastMouseX !== e.clientX || (window as any).lastMouseY !== e.clientY) {
          (window as any).lastMouseX = e.clientX;
          (window as any).lastMouseY = e.clientY;
          (window as any).isMouseFocus = true;
          setFocus(focusKey);
          setTimeout(() => { (window as any).isMouseFocus = false; }, 50);
        }
      }}
      className={`cursor-pointer group relative transition-all duration-500 rounded-xl overflow-hidden aspect-[3/4.5] bg-[#111]
                 ${focused ? 'ring-[#b5924d] ring-4 scale-105 shadow-[0_20px_40px_rgba(181,146,77,0.3)] z-40' : 'ring-white/10 ring-1 opacity-90'}`}
    >
      <img
        src={movie.stream_icon || movie.cover || ''}
        alt={movie.name}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        onError={(e) => {
          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23555'%3ENo Image%3C/text%3E%3C/svg%3E";
        }}
      />
      
      {/* Overlay dégradé avec le titre */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex items-end p-4 transition-opacity duration-300 ${focused ? 'opacity-100' : 'opacity-0'}`}>
        <div>
          <h4 className="text-white font-bold text-sm line-clamp-2">{movie.name || movie.title}</h4>
          {movie.rating && <span className="text-[#b5924d] text-xs font-bold">★ {movie.rating}</span>}
        </div>
      </div>
    </div>
  );
}
