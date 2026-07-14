const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const os = require('os');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

// OPTIMISATIONS LECTEUR IPTV - DÉCODAGE MATÉRIEL & CODECS
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoding,HardwareAcceleratedVideoDecode,CanvasOopRasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('use-angle', 'gl');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const isDev = !app.isPackaged;

// --- CONFIGURATION TÉLÉCOMMANDE ---
let activeMpvClient = null;
let currentMpvProcess = null;
let isLaunchingMpv = false;
let remotePort = 3008;
let connectedClients = new Set();

function broadcast(data) {
    const message = JSON.stringify(data);
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  console.log('[DEBUG] Interfaces réseau détectées :');
  let bestIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(` - ${name}: ${iface.address}`);
        // On privilégie les adresses qui commencent par 192 ou 172 (classique Wi-Fi/Hotspot)
        if (iface.address.startsWith('192.') || iface.address.startsWith('172.')) {
          bestIp = iface.address;
        } else if (bestIp === 'localhost') {
          bestIp = iface.address;
        }
      }
    }
  }
  return bestIp;
}

function startRemoteServer(mainWindow) {
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      const htmlPath = path.join(__dirname, 'remote.html');
      fs.readFile(htmlPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Erreur chargement télécommande');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    } else if (req.url === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
      res.end(JSON.stringify({
        name: "Platinum Remote",
        short_name: "Platinum",
        start_url: "/",
        display: "standalone",
        background_color: "#050505",
        theme_color: "#050505",
        icons: [{
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='100' fill='%23050505'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-weight='900' font-size='260' font-style='italic' fill='%23b5924d'%3EP%3C/text%3E%3C/svg%3E",
          sizes: "512x512",
          type: "image/svg+xml"
        }]
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log('[REMOTE] Téléphone connecté');

    // Envoyer l'état actuel dès la connexion
    ws.send(JSON.stringify({ 
        type: 'status', 
        playerActive: activeMpvClient !== null,
        paused: false // Par défaut au début
    }));

    ws.on('close', () => connectedClients.delete(ws));

    ws.on('message', (message) => {
      try {
        const cmd = JSON.parse(message);
        console.log('[REMOTE] Commande reçue:', cmd.action);

        if (activeMpvClient && !activeMpvClient.destroyed) {
          switch (cmd.action) {
            case 'play_pause':
              activeMpvClient.write(JSON.stringify({ command: ["cycle", "pause"] }) + "\n");
              break;
            case 'vol_up':
              activeMpvClient.write(JSON.stringify({ command: ["add", "volume", 5] }) + "\n");
              break;
            case 'vol_down':
              activeMpvClient.write(JSON.stringify({ command: ["add", "volume", -5] }) + "\n");
              break;
            case 'seek_forward':
              activeMpvClient.write(JSON.stringify({ command: ["seek", 30] }) + "\n");
              break;
            case 'seek_back':
              activeMpvClient.write(JSON.stringify({ command: ["seek", -30] }) + "\n");
              break;
            case 'seek_percent':
              activeMpvClient.write(JSON.stringify({ command: ["set_property", "percent-pos", cmd.value] }) + "\n");
              break;
            case 'set_audio':
              activeMpvClient.write(JSON.stringify({ command: ["set_property", "aid", cmd.value] }) + "\n");
              break;
            case 'set_audio_next':
              activeMpvClient.write(JSON.stringify({ command: ["cycle", "audio"] }) + "\n");
              break;
            case 'set_subtitle':
              activeMpvClient.write(JSON.stringify({ command: ["set_property", "sid", cmd.value] }) + "\n");
              break;
            case 'set_sub_next':
              activeMpvClient.write(JSON.stringify({ command: ["cycle", "sub"] }) + "\n");
              break;
            case 'stop':
              activeMpvClient.write(JSON.stringify({ command: ["stop"] }) + "\n");
              break;
          }
        }

        // --- RELAIS DE NAVIGATION (Pour TV et UI) ---
        // Si la commande commence par 'nav_', on la diffuse à tout le monde
        if (cmd.action && cmd.action.startsWith('nav_')) {
            broadcast({ type: 'nav', action: cmd.action });
        } else if (cmd.action === 'input_text') {
            broadcast({ type: 'input', value: cmd.value });
        } else if (cmd.action === 'input_focus') {
            broadcast({ type: 'input_focus', isFocused: cmd.isFocused, value: cmd.value });
        }
      } catch (e) {
        console.error('[REMOTE] Erreur commande:', e);
      }
    });
  });

  server.listen(remotePort, '0.0.0.0', () => {
    console.log(`[REMOTE] Serveur actif sur http://${getLocalIp()}:${remotePort}`);
  });
}
// -----------------------------------

function createWindow() {
  const splashWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    frame: false,
    backgroundColor: '#050505',
    alwaysOnTop: true,
    transparent: true
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    fullscreen: true,
    show: false,
    frame: false, // On retire la bordure native Windows (Netflix style)
    backgroundColor: '#141414',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Permet de bypasser les erreurs CORS pour les requêtes API
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    // En développement, on se connecte au serveur de dev Next.js
    // Camouflage Ultime : L'application se fait passer pour un appareil Apple (iPhone/CoreMedia)
    // C'est ce qui marche le mieux pour débloquer les flux récalcitrants.
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = userAgent;
      details.requestHeaders['Referer'] = 'http://127.0.0.1:3001/';
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    mainWindow.loadURL('http://127.0.0.1:3001');
  } else {
    // En production, on charge l'export statique Next.js
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // Petit délai pour laisser React Next.js s'initialiser et afficher son propre chargement fluide
    setTimeout(() => {
      if (!splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      mainWindow.show();
    }, 1500);
  });

  // Gestion des contrôles personnalisés (titlebar)
  ipcMain.on('window-min', () => mainWindow.minimize());
  ipcMain.on('window-max', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow.close());

  // Spoof User Agent
  app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

  // Authentification pour le proxy si nécessaire
  let currentProxy = null;
  ipcMain.on('set-proxy', (event, proxy) => {
    currentProxy = proxy;
    const { session } = require('electron');
    if (proxy && proxy.enabled && proxy.host && proxy.port) {
      session.defaultSession.setProxy({ proxyRules: `${proxy.host}:${proxy.port}` });
    } else {
      session.defaultSession.setProxy({ proxyRules: "" });
    }
  });

  app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy && currentProxy && currentProxy.username) {
      event.preventDefault();
      callback(currentProxy.username, currentProxy.password);
    }
  });

  // Lancement de VLC externe
  ipcMain.on('open-vlc', (event, streamUrl) => {
    const { spawn } = require('child_process');
    // User Agent iPhone/CoreMedia : extrêmement bien accepté pour les flux VOD
    const ua = "AppleCoreMedia/1.0.0.12B411 (iPhone; iPhone OS 8.1; 12B411)";

    const fs = require('fs');
    let vlcBin = 'vlc';

    const possiblePaths = [
      "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
      "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        vlcBin = p;
        break;
      }
    }

    const vlcProcess = spawn(vlcBin, [
      '--fullscreen',
      '--http-user-agent', ua,
      streamUrl
    ], { detached: true, stdio: 'ignore' });

    vlcProcess.unref();
  });

  // MOTEUR DE LECTURE PLATINUM (MPV EXPERT - STABILITÉ MAX)
  ipcMain.on('open-mpv', (event, data) => {
    if (isLaunchingMpv) {
      console.log("[LECTURE] Déjà en cours de lancement, clic ignoré.");
      return;
    }
    isLaunchingMpv = true;

    const { spawn, exec } = require('child_process');
    const mpvPath = path.resolve(__dirname, '../bin/mpv.exe');

    // On s'assure qu'aucun autre MPV ne tourne avant de lancer le nouveau
    // Cela évite d'avoir plusieurs fenêtres si l'utilisateur a cliqué plusieurs fois
    exec('taskkill /F /IM mpv.exe /T', () => {
      launchMpv();
    });

    function launchMpv() {

    // Normalisation des données (gère l'ancien format string et le nouveau format objet)
    let streamUrl, streamId, title, type;
    if (typeof data === 'string') {
      streamUrl = data;
      streamId = 'unknown';
      title = 'Flux Direct';
      type = 'unknown';
    } else {
      streamUrl = data.streamUrl;
      streamId = data.streamId;
      title = data.title || 'Flux Direct';
      type = data.type || 'unknown';
    }

    const pipePath = `\\\\.\\pipe\\mpv-${Date.now()}`;
    console.log(`[LECTURE] Tentative de lancement : ${title}`);
    console.log(`[URL] ${streamUrl}`);

    const args = [
      '--fullscreen',
      '--ontop',
      '--hwdec=auto-safe',
      '--cache=yes',
      '--demuxer-max-bytes=500M',
      '--demuxer-max-back-bytes=100M',
      '--cache-secs=3600',
      '--demuxer-readahead-secs=60',
      '--network-timeout=60',
      '--stream-lavf-o=reconnect_at_eof=1,reconnect_streamed=1,reconnect_delay_max=5',
      '--user-agent=AppleCoreMedia/1.0.0.16G77 (iPhone; CPU iPhone OS 12_4 like Mac OS X)',
      '--http-header-fields=Referer: http://127.0.0.1:3001/,Accept: */*',
      '--hls-bitrate=max',
      '--hr-seek=no', 
      `--input-ipc-server=${pipePath}`,
      '--no-ytdl'
    ];

    if (data.startTime) {
      args.push(`--start=${data.startTime}`);
      console.log(`[LECTURE] Reprise à : ${data.startTime}s`);
    }

    // PASSAGE DU PROXY À MPV (Si configuré dans l'app)
    if (currentProxy && currentProxy.enabled && currentProxy.host && currentProxy.port) {
      let proxyUrl = `http://${currentProxy.host}:${currentProxy.port}`;
      if (currentProxy.username && currentProxy.password) {
        proxyUrl = `http://${currentProxy.username}:${currentProxy.password}@${currentProxy.host}:${currentProxy.port}`;
      }
      args.push(`--http-proxy=${proxyUrl}`);
      console.log(`[PROXY] MPV utilise le proxy : ${currentProxy.host}`);
    }

    // On ajoute l'URL à la fin
    args.push(streamUrl);

    const mpvProcess = spawn(mpvPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    currentMpvProcess = mpvProcess;
    isLaunchingMpv = false; // Le processus est lancé, on débloque

    mpvProcess.stderr.on('data', (d) => console.log(`[MPV ERROR] ${d}`));
    mpvProcess.stdout.on('data', (d) => console.log(`[MPV LOG] ${d}`));

    mpvProcess.unref();

    // Petit délai pour laisser MPV créer le pipe
    setTimeout(() => {
        const net = require('net');
        const client = net.connect(pipePath, () => {
            console.log("Connecté à MPV IPC");
            activeMpvClient = client; // On le rend accessible pour la télécommande
            broadcast({ type: 'status', playerActive: true, paused: false });

            // On demande à MPV de nous prévenir quand la pause change
            client.write(JSON.stringify({ command: ["observe_property", 1, "pause"] }) + "\n");
            
            const timer = setInterval(() => {
                if (client.destroyed) { clearInterval(timer); return; }
                client.write(JSON.stringify({ command: ["get_property", "time-pos"], request_id: 1 }) + "\n");
                client.write(JSON.stringify({ command: ["get_property", "duration"], request_id: 2 }) + "\n");
                client.write(JSON.stringify({ command: ["get_property", "track-list"], request_id: 3 }) + "\n");
            }, 2000);
      });

      let lastPos = 0;
      let lastDuration = 0;

        client.on('data', (data) => {
            try {
                const responses = data.toString().split('\n').filter(l => l.trim());
                responses.forEach(res => {
                    const json = JSON.parse(res);
                    
                    // Détection du changement de pause
                    if (json.event === "property-change" && json.name === "pause") {
                        broadcast({ type: 'status', playerActive: true, paused: json.data });
                    }

                    // Gestion de la fin de fichier
                    if (json.event === "end-file") {
                      mainWindow.webContents.send('mpv-status', { streamId, status: 'completed' });
                    }

                    // Gestion des réponses aux propriétés
                    if (json.request_id === 1 && json.data !== undefined) {
                      lastPos = json.data;
                    }
                    if (json.request_id === 2 && json.data !== undefined) {
                      lastDuration = json.data;
                    }
                    if (json.request_id === 3 && json.data !== undefined) {
                        // On envoie la liste des pistes audio/sous-titres
                        const audioTracks = json.data.filter(t => t.type === 'audio').map(t => ({
                            id: t.id,
                            title: t.title || t.lang || `Piste ${t.id}`,
                            selected: t.selected
                        }));
                        const subTracks = json.data.filter(t => t.type === 'sub').map(t => ({
                            id: t.id,
                            title: t.title || t.lang || `S-T ${t.id}`,
                            selected: t.selected
                        }));
                        broadcast({ type: 'tracks', audio: audioTracks, subs: subTracks });
                    }

                    if (lastDuration > 0 && lastPos > 0) {
                        const progressData = {
                            streamId,
                            currentTime: lastPos,
                            duration: lastDuration,
                            progress: (lastPos / lastDuration) * 100
                        };
                        mainWindow.webContents.send('mpv-progress', progressData);
                        broadcast({ type: 'progress', ...progressData });
                    }
                });
            } catch (e) { }
      });

      client.on('error', () => { });
    }, 1500);

    mpvProcess.on('close', (code) => {
      mainWindow.webContents.send('mpv-status', { streamId, status: 'closed' });
      activeMpvClient = null; // Reset le client quand MPV ferme
      currentMpvProcess = null;
      isLaunchingMpv = false; // Sécurité supplémentaire
      broadcast({ type: 'status', playerActive: false, paused: false });
    });
  } // Fin de launchMpv
  });
}

app.whenReady().then(() => {
  // Gestionnaire de téléchargement NATIF (Moteur Chrome)
  let downloadTargetFolder = '';
  session.defaultSession.on('will-download', (event, item, webContents) => {
    if (downloadTargetFolder) {
      // On définit le chemin sans demander à l'utilisateur
      const fileName = item.getFilename();
      const filePath = path.join(downloadTargetFolder, fileName);
      item.setSavePath(filePath);

      item.on('updated', (event, state) => {
        if (state === 'interrupted') {
          mainWindow.webContents.send('download-status', { status: 'error', message: 'Téléchargement interrompu' });
        }
      });

      item.once('done', (event, state) => {
        if (state === 'completed') {
          mainWindow.webContents.send('download-status', { status: 'success', path: filePath });
        } else {
          mainWindow.webContents.send('download-status', { status: 'error', message: `Échec: ${state}` });
        }
        downloadTargetFolder = ''; // Reset
      });
    }
  });

  ipcMain.on('download-video', async (event, { url, fileName, folderName }) => {
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');

    const downloadRootDir = 'C:\\telechargements_iptv';
    if (!fs.existsSync(downloadRootDir)) fs.mkdirSync(downloadRootDir, { recursive: true });

    const cleanFileName = fileName.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const filePath = path.join(downloadRootDir, cleanFileName + '.mp4');

    // On utilise BITSAdmin, le service de téléchargement natif de Windows
    // /transfer : crée une tâche de transfert
    // /download : sens du transfert
    // /priority foreground : utilise toute la bande passante disponible
    const bitsCommand = `bitsadmin /transfer "IPTVDownload" /download /priority foreground "${url}" "${filePath}"`;

    console.log("Lancement BITSAdmin...");

    const bits = spawn('cmd.exe', ['/c', bitsCommand]);

    bits.on('close', (code) => {
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
        event.reply('download-status', { status: 'success', path: filePath });
      } else {
        // Si BITSAdmin échoue (car il ne gère pas toujours bien les flux sans content-length)
        // On tente un dernier baroud d'honneur avec curl.exe en mode brut
        const curlCmd = `curl.exe -L -o "${filePath}" "${url}"`;
        spawn('cmd.exe', ['/c', curlCmd]);
        event.reply('download-status', { status: 'success', message: 'Téléchargement forcé lancé. Vérifiez le dossier dans un moment.' });
      }
    });

    bits.on('error', (err) => {
      event.reply('download-status', { status: 'error', message: err.message });
    });
  });

  ipcMain.on('copy-to-clipboard', (event, text) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  });

  createWindow();
  const mainWindow = BrowserWindow.getAllWindows()[0];
  startRemoteServer(mainWindow);

  ipcMain.handle('get-remote-info', () => {
    const ip = getLocalIp();
    return {
      ip,
      port: remotePort,
      url: `http://${ip}:${remotePort}`
    };
  });

  ipcMain.on('remote-visibility', (event, data) => {
    if (typeof broadcast === 'function') {
      broadcast({ type: 'visibility', isHistoryFocus: data.isHistoryFocus });
    }
  });

  ipcMain.handle('select-files', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
    });
    return result.filePaths;
  });

  ipcMain.handle('select-image', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp', 'gif'] }]
    });
    return result.filePaths[0];
  });

  ipcMain.handle('get-avatars', async () => {
    const fs = require('fs');
    const path = require('path');
    // En Electron, le chemin 'public' dépend de si on est en dev ou prod
    const avatarsDir = isDev 
      ? path.join(__dirname, '../public/avatars')
      : path.join(process.resourcesPath, 'public/avatars'); // À adapter selon build
    
    // Fallback plus simple pour le dev et prod locale
    const rootPath = isDev ? path.join(process.cwd(), 'public') : path.join(__dirname, '../out');
    const finalAvatarsDir = path.join(rootPath, 'avatars');

    if (!fs.existsSync(finalAvatarsDir)) return [];

    try {
      const items = fs.readdirSync(finalAvatarsDir, { withFileTypes: true });
      const categories = [];

      // Racine
      const rootImages = items
        .filter(item => !item.isDirectory() && /\.(jpg|jpeg|png|svg|webp|avif)$/i.test(item.name))
        .map(item => `/avatars/${item.name}`)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      
      if (rootImages.length > 0) categories.push({ name: 'Général', images: rootImages });

      // Dossiers
      const subdirs = items.filter(item => item.isDirectory())
                           .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                           
      for (const dir of subdirs) {
        const dirPath = path.join(finalAvatarsDir, dir.name);
        const images = fs.readdirSync(dirPath)
          .filter(file => /\.(jpg|jpeg|png|svg|webp|avif)$/i.test(file))
          .map(file => `/avatars/${dir.name}/${file}`)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        
        // Nettoyer le nom pour l'affichage (supporte "01_", "1.5_", etc.)
        const cleanName = dir.name.replace(/^[\d.]+[\s_-]*/, '');
        
        if (images.length > 0) categories.push({ name: cleanName, images });
      }

      return categories;
    } catch (e) {
      return [];
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
