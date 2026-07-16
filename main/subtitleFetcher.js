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

  console.log(`[SUBTITLE] Recherche de sous-titre pour: ${data.title}`);

  // 1. Recherche avec nettoyage (retrait du préfixe type "FR | ", des accents, et de l'année)
  let baseTitle = data.title;
  if (baseTitle.includes('|')) {
    baseTitle = baseTitle.replace(/^[^|]*\|\s*/, '');
  }
  // Enlever l'année (ex: "(2026)" ou " (2026)")
  baseTitle = baseTitle.replace(/\s*\(\d{4}\)/g, '').trim();
  
  const cleanTitle = baseTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let queryParams = `languages=fr&query=${encodeURIComponent(cleanTitle)}`;
  
  // Extraction de la saison/épisode si c'est une série
  if (data.type === 'series') {
    const sMatch = data.title.match(/S(\d+)/i);
    const eMatch = data.title.match(/E(\d+)/i);
    let s = sMatch ? sMatch[1] : (data.season || '');
    let e = eMatch ? eMatch[1] : (data.episode || '');
    
    if (s && e) {
      let titleWithoutEp = cleanTitle;
      const matchIndex = cleanTitle.search(/S\d+E\d+/i);
      if (matchIndex !== -1) {
        titleWithoutEp = cleanTitle.substring(0, matchIndex);
      }
      // Nettoyer les tirets ou espaces résiduels à la fin (ex: "Serie Name - " -> "Serie Name")
      titleWithoutEp = titleWithoutEp.replace(/[\s-]+$/, '').trim();
      
      queryParams = `languages=fr&query=${encodeURIComponent(titleWithoutEp)}&season_number=${parseInt(s)}&episode_number=${parseInt(e)}`;
    }
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

  const searchResult = await fetchJson(searchUrl, options).catch(e => {
    if (e.message.includes('401')) throw new Error('Clé API OpenSubtitles invalide');
    if (e.message.includes('429')) throw new Error('Quota de téléchargement OpenSubtitles atteint');
    throw e;
  });

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

module.exports = { fetchSubtitle, cleanupCache };
