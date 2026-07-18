# Handoff (任務交接報告) — teamwork_preview_explorer_m1_2

本報告為 `heic-to-jpg` 專案之 `src/index.js`、`src/preload.js`、`src/renderer.js` 與相關模組的程式碼審查與分析交接報告。

---

## 1. Observation (觀察結果)

我們對原始碼進行了唯讀審查，觀察到以下具體程式碼片段與實作細節：

* **觀察點 A：DOM-based XSS 漏洞**
  * 檔案路徑：`src/renderer.js` 第 16-25 行
  * 程式碼內容：
    ```javascript
    function appendLog(message, type = 'info') {
      const logItem = document.createElement('div');
      logItem.className = `log-item log-${type}`;
      
      const timestamp = new Date().toLocaleTimeString();
      logItem.innerHTML = `<span>[${timestamp}]</span> ${message}`; // 此處直接以 innerHTML 載入未過濾資料
      
      logWindow.appendChild(logItem);
      logWindow.scrollTop = logWindow.scrollHeight;
    }
    ```
  * 回呼資料來源（`src/renderer.js` 第 87-120 行）：
    ```javascript
    window.electronAPI.onConversionProgress((data) => {
      const { current, total, status, details } = data;
      ...
      } else if (status === 'progress') {
        appendLog(`✅ 成功轉檔並移動原始檔：${details}`, 'success'); // details 包含檔名
      ...
      } else if (status === 'error') {
        appendLog(`❌ 轉檔失敗：${details}`, 'error'); // details 包含檔名與錯誤訊息
      ...
    ```

* **觀察點 B：IPC 參數驗證缺失**
  * 檔案路徑：`src/index.js` 第 57-74 行
  * 程式碼內容：
    ```javascript
    ipcMain.handle('start-conversion', async (event, { dirPath, recursive }) => {
      try {
        const results = await runConversion(dirPath, recursive, (current, total, status, details) => { ... });
        return { success: true, ...results };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
    ```
  * 在主行程/主進程（Main Process）的 IPC 處理常式（IPC Handler）中，並未對輸入的 `dirPath` 及 `recursive` 進行任何型別（Type）或路徑安全性的防禦性驗證。

* **觀察點 C：CPU 密集同步運算阻塞主行程**
  * 檔案路徑：`src/converter.js`
  * 實作細節：
    * 第 86-88 行：`const imgData = outputBuffer.toString('binary'); const newData = piexif.insert(exifBytes, imgData); newJpeg = Buffer.from(newData, 'binary');`
    * 轉檔與 EXIF 處理均為同步且 CPU 密集的運算。
    * 第 114-130 行：`getUniqueBaseName` 函式在 `while(true)` 迴圈中呼叫同步檔案系統 API `fs.existsSync`。
  * 整個 `runConversion` 是在主行程/主進程（Main Process）的單執行緒（Single-threaded）中被執行與驅動。

* **觀察點 D：跨裝置檔案移動問題**
  * 檔案路徑：`src/converter.js` 第 177 行
  * 程式碼內容：
    ```javascript
    await fs.rename(filePath, movedHeicPath);
    ```
  * 移動檔案時直接呼叫 `fs.rename`，並未對跨裝置移動（如外接硬碟、USB 隨身碟或 NAS 網路硬碟）可能引發的 `EXDEV` 錯誤進行錯誤捕獲與降級處理。

---

## 2. Logic Chain (邏輯鏈)

我們從上述觀察結果推導出以下邏輯關係與結論：

1. **DOM 型 XSS 漏洞的成因與威脅**：
   * 根據 *觀察點 A*，`details` 可包含使用者檔案系統中的任何檔案名稱。
   * 檔名中可能含有諸如 `<img src=x onerror=...>` 等 HTML/JavaScript 標記。
   * 當 `renderer.js` 接收到包含此檔名的進度更新，並呼叫 `appendLog` 時，由於 `innerHTML` 的解析特性，瀏覽器會直接執行該段程式碼，從而導致 DOM 型跨網站指令碼（DOM-based XSS）攻擊。

2. **GUI 凍結（Freeze）的成因**：
   * 根據 *觀察點 C*，核心轉檔演算法（`heicConvert`）、EXIF 重建（`piexif.insert`）及檔名碰撞檢測（`getUniqueBaseName` 中的 `fs.existsSync`）皆執行於主行程。
   * 即使 `runConversion` 本身被包裝為 Promise 並以 `await` 呼叫，但這此運算並非非同步的非阻塞操作，本質上仍然是同步的 CPU 密集工作與同步 I/O。
   * 由於 Node.js 與 Electron 主行程共用單一事件循環（Event Loop），因此在進行大批檔案轉檔時，主行程會無法及時處理作業系統的視窗調度與渲染行程 IPC 請求，導致 GUI 出現無回應與凍結現象。

3. **跨裝置移動 Bug 的成因**：
   * 根據 *觀察點 D*，當使用者選擇轉檔的資料夾位於與作業系統暫存目錄或應用程式運作磁碟不同的實體磁碟機（例如 USB、外接硬碟、網路共享資料夾）時，底層的系統呼叫無法使用 `rename` 來變更跨裝置的實體目錄。
   * 由於沒有 `EXDEV` 降級機制（「複製後刪除原始檔」），該檔案將會轉換失敗並拋出 `EXDEV` 錯誤，進而中斷處理流程。

---

## 3. Caveats (注意事項 / 限制)

* **注意事項**：
  * 本次審查為**唯讀調查（Read-only Investigation）**，我們並未修改專案程式碼，亦未對運行中的應用程式注入惡意檔名進行動態滲透測試，僅從靜態程式碼結構（Static Code Structure）中推導出安全隱憂。
  * 我們假設 Electron 的執行環境啟用了預設的 CSP（內容安全政策），但這通常無法完全阻擋利用暴露之 IPC API 進行的內部漏洞利用。

---

## 4. Conclusion (結論)

本專案之 GUI 介面與 IPC 通訊機制在架構設計上具備基本的安全性（開啟了上下文隔離與禁用了 Node 整合），但在細節實作上存在以下四大重要問題，需在後續的實作階段（Implementation Phase）進行修復與優化：
1. **DOM-based XSS 漏洞**：存在於 `renderer.js` 中，為高風險漏洞，必須重構為 `textContent` 寫入。
2. **GUI 凍結風險**：主行程負擔過重，應將轉檔任務抽離至工作執行緒（Worker Threads）或子行程中。
3. **IPC 輸入驗證不足**：主行程 `start-conversion` 缺乏參數型別與範圍檢查，應補足防禦性驗證。
4. **跨裝置移動 Bug**：`fs.rename` 在處理外接裝置時可能會拋出 `EXDEV` 錯誤，需增加降級複製機制。

---

## 5. Verification Method (驗證方法)

1. **驗證 DOM-based XSS**：
   * 在測試資料夾中建立檔案，命名為：`"><img src=x onerror="console.log('XSS_TRIGGERED')">.heic`。
   * 啟動應用程式（`npm start`），選擇該資料夾並開始轉檔。
   * 開啟開發者工具（DevTools），檢查 Console 日誌中是否印出 `XSS_TRIGGERED`。若印出，則確認漏洞存在。
2. **驗證 GUI 凍結**：
   * 準備 50 張以上的高解析度 HEIC 檔案。
   * 開始轉檔，並在轉檔過程中嘗試拖曳、縮放應用程式視窗，或快速點擊介面其他按鈕。若視窗拖曳出現明顯遲滯或無法移動，即證實主行程被 CPU 運算阻塞。
3. **驗證跨裝置移動錯誤**：
   * 將 HEIC 檔案放在外接隨身碟（USB Flash Drive）或另外掛載的磁碟機分割區中。
   * 指定該外接路徑進行轉檔。觀察日誌視窗中是否噴出 `EXDEV: cross-device link not permitted` 的錯誤。
