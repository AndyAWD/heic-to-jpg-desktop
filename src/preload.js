const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  startConversion: (payload) => ipcRenderer.invoke('start-conversion', payload),
  onConversionProgress: (callback) => {
    // 註冊進度更新回呼
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('conversion-progress', subscription);
    // 返回取消註冊的函式，方便清理
    return () => ipcRenderer.removeListener('conversion-progress', subscription);
  }
});
