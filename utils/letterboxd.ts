/**
 * utils/letterboxd.ts
 *
 * Recupere la note moyenne globale d'un film sur Letterboxd.
 *
 * Strategie complete (resout les titres francais et gere annee avec/sans) :
 *  1. Si IMDb ID present (ex: tt0095016) -> https://letterboxd.com/imdb/<imdbId>/
 *     Letterboxd redirige directement vers la fiche officielle (200 OK).
 *  2. Si titre en francais -> Recherche TMDB pour trouver le film exact et son titre original (anglais).
 *     Letterboxd accepte https://letterboxd.com/tmdb/<tmdbId>/ et redirige directement en 200 OK !
 *  3. Slugs directs : teste systematiquement AVEC et SANS annee a la fin
 *     (ex: "resident-evil-2026" et "resident-evil", "dune-2021" et "dune").
 *  4. Extraction de la note depuis JSON-LD (AggregateRating.ratingValue) nettoyee du CDATA.
 *
 * Cache : localStorage avec TTL de 7 jours.
 */

import { TMDB_API_KEY } from './config';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  value: string | null;
  slug?: string | null;
  timestamp: number;
}

function getCached(key: string): { value: string | null; slug?: string | null } | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return undefined;
    }
    return entry;
  } catch {
    return undefined;
  }
}

function setCache(key: string, value: string | null, slug?: string | null): void {
  try {
    const entry: CacheEntry = { value, slug, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota ou navigation privee
  }
}

/**
 * Nettoie le titre pour la recherche :
 * Retire les tags IPTV (|FR|, [VOD], etc.) et les parentheses.
 */
export function cleanTitleForSearch(title: string): string {
  if (!title) return '';
  let clean = title.trim();
  clean = clean.replace(/^(\[.*?\]|\|.*?\||[^|]*?\|\s*|\(.*?\)|\{.*?\})\s*/i, '').trim();
  if (clean.includes('(')) {
    clean = clean.split('(')[0].trim();
  }
  return clean;
}

/**
 * Extrait l'annee du titre si elle est presente dedans (ex: "Dune 2021" -> "2021").
 */
export function extractYearFromTitle(title: string): { titleClean: string; yearFound: string | null } {
  const match = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (match) {
    const yearFound = match[1];
    const titleClean = title.replace(/\b(19\d{2}|20\d{2})\b/, '').replace(/[-–_]/g, ' ').trim();
    return { titleClean, yearFound };
  }
  return { titleClean: title, yearFound: null };
}

/**
 * Transforme un titre en slug URL standard.
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Interroge TMDB avec le titre francais pour trouver le tmdbId et le titre original (anglais).
 */
async function searchTmdbForFilm(title: string, year?: string): Promise<{ tmdbId: number; originalTitle: string; year: string | null } | null> {
  if (!TMDB_API_KEY || !title) return null;
  const clean = cleanTitleForSearch(title);
  const y = year ? year.match(/\d{4}/)?.[0] : null;

  try {
    let url = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(clean) + '&language=fr-FR';
    if (y) url += '&year=' + y;

    let res = await fetch(url);
    let data = await res.json();

    if ((!data.results || data.results.length === 0) && y) {
      // Reessayer sans l'annee si annee decalee
      res = await fetch('https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(clean) + '&language=fr-FR');
      data = await res.json();
    }

    // Si pas trouve dans movie, essayer tv (pour series / mini-series)
    if (!data.results || data.results.length === 0) {
      res = await fetch('https://api.themoviedb.org/3/search/tv?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(clean) + '&language=fr-FR');
      data = await res.json();
    }

    if (data.results && data.results.length > 0) {
      const item = data.results[0];
      const relDate = item.release_date || item.first_air_date || '';
      return {
        tmdbId: item.id,
        originalTitle: item.original_title || item.original_name || item.title || item.name,
        year: relDate ? relDate.slice(0, 4) : null
      };
    }
  } catch {
    // TMDB indisponible
  }
  return null;
}

/**
 * Tente de trouver la page et le slug d'un film sur Letterboxd.
 * Essaie successivement :
 *  - Redirection IMDb
 *  - Redirection TMDB (resolut les noms francais -> anglais)
 *  - Slugs directs AVEC date et SANS date (ex: resident-evil-2026 et resident-evil)
 */
export async function resolveLetterboxdFilm(
  title: string,
  year?: string,
  imdbId?: string
): Promise<{ html: string; slug: string } | null> {
  const cleanTitle = cleanTitleForSearch(title);
  const { titleClean: titleNoYear, yearFound } = extractYearFromTitle(cleanTitle);
  const effectiveYear = year ? (year.match(/\d{4}/)?.[0] || null) : yearFound;

  const cleanImdb = imdbId && imdbId.startsWith('tt') ? imdbId : null;
  const urlsToTry: string[] = [];

  // 1. Redirection officielle par IMDb ID (si present)
  if (cleanImdb) {
    urlsToTry.push('https://letterboxd.com/imdb/' + cleanImdb + '/');
  }

  // 2. Recherche TMDB pour resoudre les titres francais en anglais et obtenir le tmdbId
  let tmdbInfo: { tmdbId: number; originalTitle: string; year: string | null } | null = null;
  try {
    tmdbInfo = await searchTmdbForFilm(titleNoYear || cleanTitle, effectiveYear || undefined);
    if (tmdbInfo) {
      // Letterboxd redirige automatiquement /tmdb/<id>/ vers la bonne fiche film !
      urlsToTry.push('https://letterboxd.com/tmdb/' + tmdbInfo.tmdbId + '/');
    }
  } catch {
    // continuer
  }

  // 3. Generer les slugs candidats (titre original anglais de TMDB, titre brut, etc.)
  const candidateTitles = new Set<string>();
  if (tmdbInfo?.originalTitle) candidateTitles.add(tmdbInfo.originalTitle);
  if (titleNoYear) candidateTitles.add(titleNoYear);
  if (cleanTitle) candidateTitles.add(cleanTitle);

  const yearsToTest = new Set<string>();
  if (effectiveYear) yearsToTest.add(effectiveYear);
  if (tmdbInfo?.year) yearsToTest.add(tmdbInfo.year);

  // Pour chaque candidat : tester AVEC la date ET SANS la date
  for (const cTitle of Array.from(candidateTitles)) {
    const baseSlug = slugify(cTitle);
    if (!baseSlug) continue;

    // Tester AVEC l'annee (ex: resident-evil-2026)
    for (const y of Array.from(yearsToTest)) {
      urlsToTry.push('https://letterboxd.com/film/' + baseSlug + '-' + y + '/');
    }
    // Tester SANS l'annee (ex: resident-evil, interstellar)
    urlsToTry.push('https://letterboxd.com/film/' + baseSlug + '/');
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html'
  };

  // Parcourir les URLs candidates
  for (const url of urlsToTry) {
    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (resp.ok) {
        const finalUrl = resp.url || url;
        const slugMatch = finalUrl.match(/\/film\/([^/]+)/);
        const slug = slugMatch ? slugMatch[1] : (cleanTitle ? slugify(cleanTitle) : '');
        const html = await resp.text();
        return { html, slug };
      }
    } catch {
      // Continuer vers la suivante
    }
  }

  return null;
}

/**
 * Trouve le slug Letterboxd d'un film.
 */
export async function findLetterboxdSlug(
  title: string,
  year?: string,
  imdbId?: string
): Promise<string | null> {
  const cleanTitle = cleanTitleForSearch(title);
  const cacheKey = 'lbd_slug_v5_' + cleanTitle.toLowerCase() + '_' + (imdbId || '');
  const cached = getCached(cacheKey);
  if (cached !== undefined && cached.slug) return cached.slug;

  const resolved = await resolveLetterboxdFilm(title, year, imdbId);
  if (resolved?.slug) {
    setCache(cacheKey, null, resolved.slug);
    return resolved.slug;
  }
  return null;
}

/**
 * Parse la note globale Letterboxd depuis le HTML d'une fiche film.
 */
function parseLetterboxdRatingFromHtml(html: string): string | null {
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const cleanJson = jsonLdMatch[1]
        .replace(/\/\* <\!\[CDATA\[ \*\//g, '')
        .replace(/\/\* \]\]> \*\//g, '')
        .trim();
      const parsed = JSON.parse(cleanJson);
      const ratingValue = parsed?.aggregateRating?.ratingValue;
      if (ratingValue && !isNaN(parseFloat(ratingValue))) {
        return parseFloat(ratingValue).toFixed(1) + '/5';
      }
    } catch {
      // continuer
    }
  }

  const dataRatingMatch = html.match(/data-average-rating="([0-9.]+)"/);
  if (dataRatingMatch) {
    const val = parseFloat(dataRatingMatch[1]);
    if (!isNaN(val) && val > 0) {
      return val.toFixed(1) + '/5';
    }
  }

  const metaMatch = html.match(/<meta\s+name="twitter:data1"\s+content="([0-9.]+)\s+out\s+of\s+5"/i);
  if (metaMatch) {
    const val = parseFloat(metaMatch[1]);
    if (!isNaN(val)) return val.toFixed(1) + '/5';
  }

  return null;
}

/**
 * Point d'entree principal pour la note globale Letterboxd.
 */
export async function fetchLetterboxdRating(
  title: string,
  year?: string,
  imdbId?: string
): Promise<string | null> {
  if (!title && !imdbId) return null;

  const cleanTitle = cleanTitleForSearch(title);
  const cacheKey = 'lbd_v5_' + cleanTitle.toLowerCase() + '_' + (year || '') + '_' + (imdbId || '');
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached.value;

  try {
    const resolved = await resolveLetterboxdFilm(cleanTitle, year, imdbId);
    if (!resolved) {
      setCache(cacheKey, null);
      return null;
    }

    const rating = parseLetterboxdRatingFromHtml(resolved.html);
    setCache(cacheKey, rating, resolved.slug);
    return rating;
  } catch (err) {
    console.warn('[Letterboxd] Erreur lors de la recuperation de la note :', err);
    return null;
  }
}
