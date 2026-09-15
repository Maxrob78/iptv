const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper pour faire une requête HTTP (gère les redirections)
function fetchJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      // Gestion des redirections (souvent 301 chez OpenSubtitles)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
           const baseUrl = new URL(url);
           redirectUrl = baseUrl.origin + redirectUrl;
        }
        console.log('[SUBTITLE] Redirection vers:', redirectUrl);
        req.destroy();
        return fetchJson(redirectUrl, options, body).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        } else {
          reject(new Error(`HTTP ${res.statusCode} - ${data}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout de la recherche de sous-titres (5s)')); });
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    const requestDownload = (downloadUrl) => {
      const req = https.get(downloadUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (!redirectUrl.startsWith('http')) {
             const baseUrl = new URL(downloadUrl);
             redirectUrl = baseUrl.origin + redirectUrl;
          }
          return requestDownload(redirectUrl);
        }
        
        if (res.statusCode !== 200) {
          fs.unlink(destPath, () => {});
          return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      });
      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        fs.unlink(destPath, () => {});
        reject(new Error('Download timeout'));
      });
    };

    requestDownload(url);
  });
}

/**
 * Nettoie les sous-titres de plus de 30 jours
 */
function cleanupCache(cacheDir) {
  if (!fs.existsSync(cacheDir)) return;
  const now = Date.now();
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
  
  fs.readdir(cacheDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      if (file.endsWith('.srt') || file.endsWith('.vtt')) {
        const filePath = path.join(cacheDir, file);
        fs.stat(filePath, (err, stats) => {
          if (!err && (now - stats.mtimeMs > maxAge)) {
            fs.unlink(filePath, () => console.log(`[SUBTITLE] Nettoyage ancien fichier: ${file}`));
          }
        });
      }
    });
  });
}

/**
 * Nettoie le titre d'un film ou d'une série pour maximiser les correspondances OpenSubtitles
 */
function parseAndCleanTitle(rawTitle, data = {}) {
  if (!rawTitle) return { cleanTitle: '', year: null, season: null, episode: null };

  let title = rawTitle;

  // 1. Nettoyer les extensions de fichiers (.mkv, .mp4, etc.)
  title = title.replace(/\.(mkv|mp4|avi|ts|m3u8|webm)$/i, '');

  // 2. Remplacer les points et underscores par des espaces
  title = title.replace(/[_.]/g, ' ');

  // 3. Retirer les préfixes IPTV courants : "FR | ", "FR : ", "[FR] ", "FR - ", "EN/FR : ", "VF | ", etc.
  if (title.includes('|')) {
    title = title.replace(/^[^|]*\|\s*/, '');
  }
  title = title.replace(/^(?:\[?\s*(?:FR|VF|VOSTFR|TRUEFRENCH|MULTI|EN|FRENCH|QC)\s*\]?)\s*[:\-_]\s*/i, '');
  title = title.replace(/^\[\s*(?:FR|VF|VOSTFR|TRUEFRENCH|MULTI|EN|FRENCH|QC)\s*\]\s*/i, '');

  // 4. Extraction Saison / Épisode pour les séries
  let season = data.season ? parseInt(data.season, 10) : null;
  let episode = data.episode ? parseInt(data.episode, 10) : null;
  
  const sMatch = title.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i) || title.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (sMatch) {
    if (!season) season = parseInt(sMatch[1], 10);
    if (!episode) episode = parseInt(sMatch[2], 10);
    const idx = title.search(/\b(S\d{1,2}\s*E\d{1,3}|\d{1,2}x\d{1,3})\b/i);
    if (idx !== -1) {
      title = title.substring(0, idx);
    }
  }

  // 5. Extraction de l'année (4 chiffres entre 1900 et 2099)
  let year = null;
  const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
    title = title.replace(/\b(19\d\d|20\d\d)\b/g, ' ');
  }

  // 6. Retirer le contenu des parenthèses et crochets
  title = title.replace(/\([^)]*\)/g, ' ');
  title = title.replace(/\[[^\]]*\]/g, ' ');

  // 7. Retirer les tags IPTV, qualités, codecs, formats, releases et langues parasites
  const tagsRegex = /\b(4k|uhd|2160p|1080p|1080i|720p|480p|hd|fhd|sd|imax|bluray|bdrip|brrip|web-?dl|webrip|web|hdtv|remux|cam|ts|tc|dvdrip|dvd|x264|x265|h264|h265|hevc|avc|10bit|hdr|hdr10(\+)?|dv|dolby\s*vision|atmos|ac3|aac|dts(-?hd)?|truehd|5\.1|7\.1|ddp5\.1|dd5\.1|multi|truefrench|french|vff|vfq|vf|vostfr|subfrench|proper|repack|extended(\s*cut)?|unrated|directors?\s*cut|final\s*cut)\b/gi;
  title = title.replace(tagsRegex, ' ');

  // 8. Retirer les groupes de release résiduels à la fin (ex: "-EXTREME", "-YIFY")
  title = title.replace(/\s*-\s*[A-Za-z0-9]+$/g, '');

  // 9. Nettoyer les symboles spéciaux résiduels
  title = title.replace(/[:;/\\~#^&$*+=?!<>|]/g, ' ');
  title = title.replace(/\s*-\s*/g, ' ');

  // 10. Supprimer les accents et normaliser en minuscules (évite les 301 de l'API OpenSubtitles)
  title = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  title = title.replace(/\s+/g, ' ').trim().toLowerCase();

  return { cleanTitle: title, year, season, episode };
}

/**
 * Cherche et télécharge un sous-titre français
 * data: { title, type, season, episode, streamId }
 */
async function fetchSubtitle(data, apiKey, cacheDir) {
  if (!apiKey) return null;
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const srtPath = path.join(cacheDir, `${data.streamId}.srt`);
  const vttPath = path.join(cacheDir, `${data.streamId}.vtt`);
  
  if (fs.existsSync(srtPath)) return srtPath;
  if (fs.existsSync(vttPath)) return vttPath;

  console.log(`[SUBTITLE] Titre brut reçu: "${data.title}"`);

  // Nettoyage intelligent et robuste du titre
  const { cleanTitle, year, season, episode } = parseAndCleanTitle(data.title, data);
  console.log(`[SUBTITLE] Titre nettoyé: "${cleanTitle}" | Année: ${year || 'N/A'} | S${season || '?'}:E${episode || '?'}`);

  if (!cleanTitle) {
    throw new Error('Titre vide après nettoyage');
  }

  let queryParams = `languages=fr&query=${encodeURIComponent(cleanTitle)}&order_by=download_count&order_direction=desc`;
  
  if (data.type === 'series' && season && episode) {
    queryParams += `&season_number=${season}&episode_number=${episode}`;
  } else if (year) {
    queryParams += `&year=${year}`;
  }

  const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${queryParams}`;
  const options = {
    headers: {
      'Api-Key': apiKey,
      'User-Agent': 'iptv-netflix v1.0.0',
      'Accept': 'application/json'
    },
    timeout: 5000 // 5 sec timeout
  };

  let searchResult = await fetchJson(searchUrl, options).catch(e => {
    if (e.message.includes('401')) throw new Error('Clé API OpenSubtitles invalide');
    if (e.message.includes('429')) throw new Error('Quota de téléchargement OpenSubtitles atteint');
    throw e;
  });

  // Si aucun résultat avec le filtre d'année, réessai sans filtre d'année
  if ((!searchResult.data || searchResult.data.length === 0) && year && data.type !== 'series') {
    console.log(`[SUBTITLE] Aucun résultat avec l'année ${year}, nouvel essai sans filtre d'année...`);
    const fallbackUrl = `https://api.opensubtitles.com/api/v1/subtitles?languages=fr&query=${encodeURIComponent(cleanTitle)}&order_by=download_count&order_direction=desc`;
    searchResult = await fetchJson(fallbackUrl, options).catch(() => searchResult);
  }

  if (!searchResult.data || searchResult.data.length === 0) {
    throw new Error('Aucun sous-titre FR trouvé');
  }

  // Prendre le meilleur résultat (souvent le premier)
  const bestMatch = searchResult.data[0];
  const fileId = bestMatch.attributes.files[0].file_id;
  const isVtt = bestMatch.attributes.files[0].file_name.endsWith('.vtt');
  const destPath = isVtt ? vttPath : srtPath;

  console.log(`[SUBTITLE] Fichier trouvé (ID: ${fileId}), demande du lien de téléchargement...`);

  // 2. Récupérer le lien de téléchargement
  const downloadUrl = `https://api.opensubtitles.com/api/v1/download`;
  const dlOptions = {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'User-Agent': 'iptv-netflix v1.0.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: 5000
  };
  
  const downloadInfo = await fetchJson(downloadUrl, dlOptions, { file_id: fileId });
  if (!downloadInfo.link) {
    throw new Error('Lien de téléchargement non fourni par l\'API');
  }

  console.log(`[SUBTITLE] Téléchargement du fichier...`);
  
  // 3. Télécharger le fichier
  await downloadFile(downloadInfo.link, destPath);
  
  console.log(`[SUBTITLE] Sous-titre sauvegardé: ${destPath}`);
  return destPath;
}

module.exports = { fetchSubtitle, cleanupCache, parseAndCleanTitle };
