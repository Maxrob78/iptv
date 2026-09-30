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
 * Nettoie le titre d'un film ou d'une série pour maximiser les correspondances TMDB.
 * Gère les préfixes IPTV, les années collées au titre (ex: "Zombieland: Double Tap - 2019"),
 * les tags techniques (4K, MULTI, VOSTFR, etc.) et extrait l'année réelle.
 */
export function cleanMovieTitleForTmdb(rawTitle: string, inputYear?: string): { cleanTitle: string; year: string | null } {
  let title = (rawTitle || '').trim();
  let extractedYear: string | null = null;

  // 1. Supprimer les préfixes IPTV comme [FR], |FR|, FR|, 4K|, (VOD), etc.
  title = title.replace(/^(\[.*?\]|\|.*?\||[^|]*?\|\s*|\(.*?\)|\{.*?\})\s*/i, '').trim();

  // 2. Extraire l'année dans le titre si présente (ex: " - 2019", "(2019)", "[2019]", " 2019")
  const yearMatch = title.match(/(?:[-_\s\(\[])(19\d{2}|20\d{2})(?:[-_\s\)\]]|$)/);
  if (yearMatch) {
    extractedYear = yearMatch[1];
    title = title.replace(yearMatch[0], ' ');
  }

  // 3. Supprimer les tags de format, qualité et langue courants dans l'IPTV
  const tagsRegex = /\b(4k|uhd|1080p|720p|480p|hd|fhd|bluray|bdrip|webrip|dvdrip|hdr|10bit|x264|x265|hevc|multi|truefrench|vff|vf|vostfr|vost|vo|french|remastered|extended|directors cut|uncut)\b/gi;
  title = title.replace(tagsRegex, '');

  // 4. Nettoyer les parenthèses, crochets et séparateurs orphelins
  title = title.replace(/[\(\[\{\)\]\}]/g, ' ');
  title = title.replace(/\s*[-–_:]+\s*$/, '');
  title = title.replace(/^\s*[-–_:]+\s*/, '');
  title = title.replace(/\s+/g, ' ').trim();

  const finalYear = inputYear ? (inputYear.match(/\d{4}/)?.[0] || extractedYear) : extractedYear;
  return { cleanTitle: title, year: finalYear };
}

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
    const { cleanTitle, year: cleanYear } = cleanMovieTitleForTmdb(title, year);
    let targetId: number | null = null;
    let endpointType: 'movie' | 'tv' = type === 'series' ? 'tv' : 'movie';

    // 1. Si on a un IMDb ID valide, utiliser /find/<imdbId> (résolution 100% exacte)
    if (imdbId && typeof imdbId === 'string' && imdbId.startsWith('tt')) {
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

    // 2. Recherche textuelle par titre
    if (!targetId && cleanTitle) {
      // Étape 2A : Recherche avec le titre nettoyé et l'année
      let searchUrl = `${BASE_URL}/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR`;
      if (cleanYear) {
        searchUrl += endpointType === 'movie' ? `&year=${cleanYear}` : `&first_air_date_year=${cleanYear}`;
      }

      let res = await fetch(searchUrl);
      let data = await res.json();

      // Étape 2B : Si 0 résultat et qu'on avait filtré par année, chercher sans l'année
      if ((!data.results || data.results.length === 0) && cleanYear) {
        res = await fetch(`${BASE_URL}/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=fr-FR`);
        data = await res.json();
      }

      // Étape 2C : Si toujours 0 résultat et que le titre contient un sous-titre (ex: "Zombieland: Double Tap" -> "Zombieland")
      if ((!data.results || data.results.length === 0) && (cleanTitle.includes(':') || cleanTitle.includes(' - '))) {
        const primaryTitle = cleanTitle.split(/[:\-]/)[0].trim();
        if (primaryTitle.length >= 3) {
          let fallbackUrl = `${BASE_URL}/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(primaryTitle)}&language=fr-FR`;
          if (cleanYear) {
            fallbackUrl += endpointType === 'movie' ? `&year=${cleanYear}` : `&first_air_date_year=${cleanYear}`;
          }
          const fallbackRes = await fetch(fallbackUrl);
          const fallbackData = await fallbackRes.json();
          if (fallbackData.results && fallbackData.results.length > 0) {
            data = fallbackData;
          }
        }
      }

      if (data.results && data.results.length > 0) {
        targetId = data.results[0].id;
      }
    }

    if (!targetId) return null;

    // 3. Récupérer détails complets avec crédits en français
    const detailsRes = await fetch(`${BASE_URL}/${endpointType}/${targetId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
    if (!detailsRes.ok) return null;
    const item = await detailsRes.json();

    let plot = item.overview || '';
    // Si le synopsis français est vide, tenter de récupérer la description en VO pour ne pas laisser vide
    if (!plot.trim()) {
      try {
        const enRes = await fetch(`${BASE_URL}/${endpointType}/${targetId}?api_key=${TMDB_API_KEY}&language=en-US`);
        if (enRes.ok) {
          const enData = await enRes.json();
          if (enData.overview) {
            plot = enData.overview;
          }
        }
      } catch {}
    }

    const cast = (item.credits?.cast || []).slice(0, 10).map((c: any) => c.name).join(', ');
    let director = '';
    if (endpointType === 'movie') {
      director = (item.credits?.crew || []).find((c: any) => c.job === 'Director')?.name || '';
    } else {
      director = (item.created_by || []).map((c: any) => c.name).join(', ') || (item.credits?.crew || []).find((c: any) => c.job === 'Director' || c.job === 'Executive Producer')?.name || '';
    }

    const genre = (item.genres || []).map((g: any) => g.name).join(', ');
    const releaseDate = item.release_date || item.first_air_date || cleanYear || '';
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
