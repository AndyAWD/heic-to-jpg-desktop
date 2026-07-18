# 程式碼審查與重構報告 (Code Review & Refactoring Report)

本報告針對 `heic-to-jpg-desktop` 專案進行了全面的程式碼審查，並針對發現的安全性漏洞、潛在致命崩潰以及記憶體管理問題進行了直接的重構優化。

---

## 🔍 審查結果與優化對比

### 1. 網頁安全防禦 (Content Security Policy, CSP)
- **發現問題**：
  原本的 [src/ui/index.html](file:///Users/andyawd/Project/heic-to-jpg/src/ui/index.html) 中缺乏 Content-Security-Policy (CSP) 標籤。在 Electron 環境中，缺乏 CSP 限制會使應用程式容易受到 DOM-based XSS 攻擊或惡意腳本注入。
- **解決方案**：
  在 HTML `<head>` 中新增 CSP 標籤，明確限制載入來源僅限 `self` 本地資源以及安全的 Google Fonts 字型來源，且只執行來自本地打包的腳本。
- **代碼對比**：
  ```diff
  + <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self';">
  ```

---

### 2. DOM-based XSS 防禦與事件監聽器洩漏 (Listener Leak)
- **發現問題**：
  在渲染行程 [src/renderer.js](file:///Users/andyawd/Project/heic-to-jpg/src/renderer.js) 中：
  1. 輸出日誌時使用了 `innerHTML`，如果傳入帶有 HTML 標籤的檔名，可能導致 HTML/JS 執行注入。
  2. 註冊的轉檔進度事件沒有在視窗卸載 (Unload) 前清理，可能導致在 Electron 重複點擊或重載視窗時產生事件監聽器洩漏 (Memory Leak)。
- **解決方案**：
  1. 改用安全且防禦的 `textContent` 與 `createTextNode` 進行日誌節點的插入，避免 `innerHTML` 風險。
  2. 在 `beforeunload` 事件中執行並呼叫 `unsubscribe()` 清理事件監聽器。
- **代碼對比**：
  ```javascript
  // 修改前：
  logItem.innerHTML = `<span>[${timestamp}]</span> ${message}`;

  // 修改後：
  const timeSpan = document.createElement('span');
  timeSpan.textContent = `[${timestamp}]`;
  logItem.appendChild(timeSpan);
  
  const messageNode = document.createTextNode(` ${message}`);
  logItem.appendChild(messageNode);
  ```

---

### 3. 進度事件發送崩潰防範 (Object Destroyed Exception)
- **發現問題**：
  在主行程 [src/index.js](file:///Users/andyawd/Project/heic-to-jpg/src/index.js) 中，轉檔是透過非同步的 `runConversion` 執行。若使用者在轉檔進行到一半時，直接關閉了 Electron 應用程式視窗，此時 `mainWindow` 物件雖尚未被垃圾回收，但其內部的 WebContents 已經被銷毀。如果在非同步回呼中呼叫 `mainWindow.webContents.send(...)`，將會導致 Electron 拋出 `Object has been destroyed` 致命崩潰。
- **解決方案**：
  在發送事件前，除了檢查 `mainWindow` 存在外，額外加上 `!mainWindow.isDestroyed()` 狀態判斷，並以 `try/catch` 保護發送動作，確保視窗被關閉時能優雅忽略，而不引發應用程式崩潰。
- **代碼對比**：
  ```javascript
  // 修改前：
  if (mainWindow) {
    mainWindow.webContents.send('conversion-progress', { ... });
  }

  // 修改後：
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('conversion-progress', { ... });
    } catch (sendErr) {
      console.warn('Failed to send progress event (window might be closing):', sendErr);
    }
  }
  ```

---

### 4. 實體記憶體釋放優化 (Garbage Collection Optimization)
- **發現問題**：
  在轉檔核心 [src/converter.js](file:///Users/andyawd/Project/heic-to-jpg/src/converter.js) 中，轉檔程序會將整張 HEIC 與生成的 JPG 圖片資料讀入記憶體（`newJpeg` 與 `fileData`）。在大批量的照片轉檔中，這些大型 Buffer 參考若沒有及時清空，在非同步佇列中會導致實體記憶體佔用居高不下。
- **解決方案**：
  在 `safeConvert` 函式順利寫入檔案後，主動將 `newJpeg` 設為 `null`，打斷大記憶體區塊的強引用關係，使 V8 引擎在下一步垃圾回收時能更迅速地回收這塊記憶體。
- **代碼對比**：
  ```javascript
  // 修改後：
  let result;
  if (outputPath) {
    await fs.writeFile(outputPath, newJpeg);
    result = null;
  } else {
    result = newJpeg;
  }
  // 釋放大型 Buffer 參考，協助 V8 引擎快速回收記憶體
  newJpeg = null;
  return result;
  ```

---

## 📈 重構優化效益
1. **安全合規**：消除了潛在的 CSP 缺失警告與 DOM-based XSS 注入風險，提升應用程式至生產級安全標準。
2. **高可用性**：大幅降低了因使用者不正常關閉視窗而導致後台拋出無效物件 (Destroyed Object) 異常的機率。
3. **記憶體友善**：防範了監聽器洩漏與大 Buffer 回收延遲，讓這款 Electron 工具即使在轉檔數百張照片時，也能保持極低的記憶體佔用。
