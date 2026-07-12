const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  windowMinimize: () => ipcRenderer.send('window-min'),
  windowMaximize: () => ipcRenderer.send('window-max'),
  windowClose: () => ipcRenderer.send('window-close'),
  openVLC: (streamUrl) => ipcRenderer.send('open-vlc', streamUrl),
  openMPV: (streamUrl) => ipcRenderer.send('open-mpv', streamUrl),
  setProxy: (proxy) => ipcRenderer.send('set-proxy', proxy),
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  getLocalIp: () => ipcRenderer.invoke('get-remote-info').then(info => info.ip),
  getRemoteInfo: () => ipcRenderer.invoke('get-remote-info')
});
