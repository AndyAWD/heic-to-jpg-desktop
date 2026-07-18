# 重構與優化計畫

本計畫旨在針對 `heic-to-jpg` 專案進行安全重構與優化，解決 EXIF 旋轉、跨裝置檔案搬移、DOM-based XSS 漏洞、Electron 懸空行程、I/O 阻塞與併發限制等問題，並補齊 package.json 直接依賴項。

## 1. package.json 依賴項補充
- **修改檔案**：`package.json`
- **內容**：在 `dependencies` 中明確加入：
  - `"exifr": "^7.1.3"`
  - `"heic-convert": "^2.1.0"`
  - `"piexif-ts": "^2.1.0"`
- **目的**：解決隱式/間接依賴問題，確保專案安裝與執行時直接拉取這些必備套件。

## 2. EXIF 旋轉與寬高補正邏輯修正
- **修改檔案**：`src/converter.js`
- **內容**：
  在 `safeConvert` 中：
  1. 先取得原本的 `Orientation` 數值：`const origOrientation = ifd0[piexif.TagValues.ImageIFD.Orientation];`
  2. 若 `origOrientation > 4`，則互換 `exif[piexif.TagValues.ExifIFD.PixelXDimension]` 與 `exif[piexif.TagValues.ExifIFD.PixelYDimension]`。
  3. 最後再將 `ifd0[piexif.TagValues.ImageIFD.Orientation]` 強制覆寫為 `1`。
- **目的**：修正先將 Orientation 覆寫為 1 導致隨後長寬判定失效的 bug。

## 3. 跨裝置搬移 fallback (EXDEV 錯誤處理)
- **修改檔案**：`src/converter.js`
- **內容**：
  在 `convertSingleFile` 的 `fs.rename` 處：
  ```javascript
  try {
    await fs.rename(filePath, movedHeicPath);
  } catch (renameErr) {
    if (renameErr.code === 'EXDEV') {
      await fs.copyFile(filePath, movedHeicPath);
      await fs.unlink(filePath);
    } else {
      throw renameErr;
    }
  }
  ```
- **目的**：在跨檔案系統（例如從記憶卡或外部硬碟到本地磁碟）搬移時，遇到 `EXDEV` 錯誤能自動降級為「複製後刪除」的安全備份方案。

## 4. 非同步檔案存在檢查與併發控制限制
- **修改檔案**：`src/converter.js`
- **內容**：
  1. 實作非同步 `fileExists` 輔助函式：
     ```javascript
     async function fileExists(p) {
       try {
         await fs.access(p);
         return true;
       } catch {
         return false;
       }
     }
     ```
  2. 將 `getUniqueBaseName` 改為非同步函式：
     ```javascript
     async function getUniqueBaseName(parentDir, baseName) { ... }
     ```
     內部使用 `await Promise.all([fileExists(...), ...])` 代替同步的 `fs.existsSync`。
  3. 在 `convertSingleFile` 中，以 `await getUniqueBaseName` 來呼叫。
  4. 實作 `runConversion` 中的 Promise 限制併發：
     - 利用 `os.cpus().length`，計算 `Math.max(1, cpus - 1)` 作為併發上限。
     - 使用 Worker Pool 機制同時轉換多個檔案，限制最大同時轉檔的 Buffer 數，防止記憶體洩漏與 OOM。
- **目的**：避免同步 I/O 阻塞 Event Loop；實作 Concurrency Control 發揮多核心效能並限制記憶體用量。

## 5. DOM-based XSS 漏洞修正
- **修改檔案**：`src/renderer.js`
- **內容**：
  修正 `appendLog` 函數，停止使用 `innerHTML` 拼接日誌，改用安全的方式：
  ```javascript
  function appendLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    const timestamp = new Date().toLocaleTimeString();
    
    const timeSpan = document.createElement('span');
    timeSpan.textContent = `[${timestamp}]`;
    logItem.appendChild(timeSpan);
    
    const messageNode = document.createTextNode(` ${message}`);
    logItem.appendChild(messageNode);
    
    logWindow.appendChild(logItem);
    logWindow.scrollTop = logWindow.scrollHeight;
  }
  ```
- **目的**：防止惡意 HEIC 檔名（含有 HTML 標籤或 onerror script）注入 DOM 造成 XSS 攻擊。

## 6. 清理事件監聽器以防記憶體洩漏
- **修改檔案**：`src/renderer.js`
- **內容**：
  在載入時：
  ```javascript
  const unsubscribe = window.electronAPI.onConversionProgress((data) => { ... });
  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  });
  ```
- **目的**：在渲染進程視窗被銷毀/解除安裝前，確實移除進度監聽器。

## 7. 防止 Electron 背景轉檔任務懸空
- **修改檔案**：`src/index.js`
- **內容**：
  ```javascript
  app.on('window-all-closed', () => {
    app.quit();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
  ```
- **目的**：確保主視窗關閉時，不論任何平台，轉檔任務均能安全退出且行程完全中止，不留懸空背景進程。

## 8. 自行撰寫測試進行功能驗證
- **新增檔案**：`tests/refactor.test.js`
- **內容**：撰寫測試程式碼，測試 `safeConvert` 對 Orientation 的旋轉補正、`fileExists`、`getUniqueBaseName` 的不衝突命名，以及 `convertSingleFile` 的跨裝置 fallback（可透過 stub / spy 測試 rename 拋出 EXDEV 時的情況）。
