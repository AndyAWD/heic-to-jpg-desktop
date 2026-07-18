const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { runConversion } = require('./converter');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    title: 'HEIC 無損轉檔工具 (EXIF 保留)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    // macOS 上可以讓標題列與網頁融合 (無邊框但保留原生按鈕)
    titleBarStyle: 'hiddenInset',
    // 預設背景色，避免白色閃爍
    backgroundColor: '#0f172a' 
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit(); // 強制退出，防止背景有非同步轉檔任務懸空
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit(); // 強制退出所有平台
});

// IPC 監聽：選擇資料夾
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

// IPC 監聽：執行轉檔
ipcMain.handle('start-conversion', async (event, { dirPath, recursive }) => {
  try {
    const results = await runConversion(dirPath, recursive, (current, total, status, details) => {
      // 即時把進度發送給前端 Renderer，防禦視窗已被銷毀的極限狀況
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('conversion-progress', {
            current,
            total,
            status,
            details
          });
        } catch (sendErr) {
          console.warn('Failed to send progress event (window might be closing):', sendErr);
        }
      }
    });
    return { success: true, ...results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
