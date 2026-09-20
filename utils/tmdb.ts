import config from '../config.json';

const TMDB_API_KEY = (config as any).TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  character?: string;
  job?: string;
}

export interface TMDBDetails {
  plot: string;
  cast: string;
  director: string;
  releaseDate?: string;
  backdropUrl?: string;
  coverUrl?: string;
  genre?: string;
}

export const tmdbApi = {
  async searchPerson(name: string): Promise<number | null> {
    if (!TMDB_API_KEY) {
      console.warn("Clé API TMDB manquante dans config.json");
      return null;
    }

    try {
      const res = await fetch(`${BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}&language=fr-FR`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].id;
      }
      return null;
    } catch (e) {
      console.error("Erreur TMDB searchPerson:", e);
      return null;
    }
  },

  async getPersonMovies(personId: number): Promise<TMDBMovie[]> {
    if (!TMDB_API_KEY) return [];

    try {
      const res = await fetch(`${BASE_URL}/person/${personId}/movie_credits?api_key=${TMDB_API_KEY}&language=fr-FR`);
      const data = await res.json();
      
      const allMovies = [...(data.cast || []), ...(data.crew || [])];
      const uniqueMovies = Array.from(new Map(allMovies.map(m => [m.id, m])).values());
      
      return uniqueMovies.sort((a: any, b: any) => {
        return (b.popularity || 0) - (a.popularity || 0);
      }).map((m: any) => ({
        id: m.id,
        title: m.title,
        original_title: m.original_title,
        release_date: m.release_date,
        poster_path: m.poster_path,
        character: m.character,
        job: m.job
      }));
    } catch (e) {
      console.error("Erreur TMDB getPersonMovies:", e);
      return [];
    }
  }
};

/**
 * Récupère en temps réel les détails complets d'un film ou d'une série (synopsis français, casting, réalisateur, etc.)
 * Utilisé pour enrichir instantanément la fiche si le serveur IPTV n'a pas renvoyé de synopsis ou d'acteurs.
 */
export async function fetchTmdbDetails(
  title: string,
  year?: string,
  type: 'movie' | 'series' = 'movie',
  imdbId?: string
): Promise<TMDBDetails | null> {
  if (!TMDB_API_KEY || (!title && !imdbId)) return null;

  try {
    let cleanTitle = (title || '').trim();
    cleanTitle = cleanTitle.replace(/^(\[.*?\]|\|.*?\||[^|]*?\|\s*|\(.*?\)|\{.*?\})\s*/i, '').trim();
    if (cleanTitle.includes('(')) {
      cleanTitle = cleanTitle.split('(')[0].trim();
    }
    const cleanYear = year ? year.match(/\d{4}/)?.[0] : null;

    let targetId: number | null = null;
    let endpointType: 'movie' | 'tv' = type === 'series' ? 'tv' : 'movie';

    // 1. Si on a un IMDb ID, utiliser /find/<imdbId> (résolution 100% exacte)
    if (imdbId && imdbId.startsWith('tt')) {
      try {
        const findRes = await fetch(`${BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=fr-FR`);
        if (findRes.ok) {
          const findData = await findRes.json();
          if (type === 'series' && findData.tv_results && findData.tv_results.length > 0) {
            targetId = findData.tv_results[0].id;
            endpointType = 'tv';
          } else if (findData.movie_results && findData.movie_results.length > 0) {
            targetId = findData.movie_results[0].id;
            endpointType = 'movie';
          } else if (findData.tv_results && findData.tv_results.length > 0) {
            targetId = findData.tv_results[0].id;
            endpointType = 'tv';
          }
        }
      } catch {
        // continuer avec la recherche textuelle
      }
    }

    // 2. Si pas trouvé par IMDb ID, chercher par titre
    if (!targetId && cleanTitle) {
      let searchUrl = `${BASE_URL}/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR`;
      if (cleanYear) {
        searchUrl += endpointType === 'movie' ? `&year=${cleanYear}` : `&first_air_date_year=${cleanYear}`;
      }

      let res = await fetch(searchUrl);
      let data = await res.json();

      if ((!data.results || data.results.length === 0) && cleanYear) {
        res = await fetch(`${BASE_URL}/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR`);
        data = await res.json();
      }

      if (data.results && data.results.length > 0) {
        targetId = data.results[0].id;
      }
    }

    if (!targetId) return null;

    // 3. Récupérer détails complets avec crédits
    const detailsRes = await fetch(`${BASE_URL}/${endpointType}/${targetId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
    if (!detailsRes.ok) return null;
    const item = await detailsRes.json();

    const cast = (item.credits?.cast || []).slice(0, 10).map((c: any) => c.name).join(', ');
    let director = '';
    if (endpointType === 'movie') {
      director = (item.credits?.crew || []).find((c: any) => c.job === 'Director')?.name || '';
    } else {
      director = (item.created_by || []).map((c: any) => c.name).join(', ') || (item.credits?.crew || []).find((c: any) => c.job === 'Director' || c.job === 'Executive Producer')?.name || '';
    }

    const genre = (item.genres || []).map((g: any) => g.name).join(', ');
    const plot = item.overview || '';
    const releaseDate = item.release_date || item.first_air_date || '';
    const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined;
    const coverUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;

    return {
      plot,
      cast,
      director,
      genre,
      releaseDate,
      backdropUrl,
      coverUrl
    };
  } catch (err) {
    console.warn('[TMDB] Erreur fetchTmdbDetails:', err);
    return null;
  }
}
