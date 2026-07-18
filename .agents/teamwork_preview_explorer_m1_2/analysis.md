# 程式碼審查與分析報告 — HEIC 無損轉檔工具 (GUI 與 IPC)

本報告針對 `heic-to-jpg` 專案中的 `src/index.js`、`src/preload.js`、`src/renderer.js` 以及 `src/converter.js` 進行了全面的程式碼審查（Code Review）。主要著重於使用者介面（UI / User Interface）生命週期管理、進程間通訊/行程間通訊（IPC / Inter-Process Communication）安全性、非同步呼叫穩定性與潛在錯誤處理等面向。

---

## 1. 核心分析結果

### 1.1 GUI 視窗生命週期管理與 Electron 主行程/主進程（Main Process）/ 渲染行程/渲染進程（Renderer Process）安全性
* **視窗生命週期管理**：
  * 在 `src/index.js` 中，主行程/主進程（Main Process）於 `createWindow()` 內正確宣告了 `mainWindow.on('closed', () => { mainWindow = null; })`，這能防止視窗關閉後垃圾回收失敗導致的記憶體洩漏（Memory Leak）。
  * 針對 macOS 的生命週期機制，實作了 `app.on('activate', ...)` 與 `window-all-closed` 平台判斷（`process.platform !== 'darwin'`），能正確在關閉所有視窗時保持應用程式背景執行，並於重新點擊 Dock 圖示時重建視窗，符合 macOS 原生軟體體驗。
* **通訊機制安全性**：
  * 專案啟用了上下文隔離（Context Isolation）與禁用了 Node 整合（Node Integration）（於 `webPreferences` 中設定 `contextIsolation: true` 與 `nodeIntegration: false`），並透過 `contextBridge.exposeInMainWorld` 來曝露有限的 `electronAPI`。這是 Electron 安全性設計的優良實作（Best Practice），可防範渲染行程/渲染進程直接呼叫 Node.js APIs。
  * **主行程/主進程參數驗證缺失**：在 `index.js` 的 `start-conversion` 監聽器中，直接接收了渲染行程/渲染進程傳遞的 `dirPath` 與 `recursive` 參數，主行程/主進程並沒有對這些輸入進行任何型別、格式或安全範圍的驗證。若渲染行程被劫持，惡意攻擊者可傳入任意物件或惡意字串，可能導致後續檔案系統操作出錯或觸發其他漏洞。
  * **全域視窗依賴性**：主行程/主進程使用全域變數 `mainWindow` 來呼叫 `mainWindow.webContents.send` 發送進度通知。此做法在單視窗架構下雖可運作，但在視窗銷毀邊界或未來擴充為多視窗時容易拋出例外（Exception）。較安全的做法是使用 IPC 事件物件所提供的發送源：`event.sender.send`。

### 1.2 渲染行程中的錯誤處理與進度條/日誌顯示邏輯
* **錯誤處理與防禦性**：
  * `converter.js` 的 `runConversion` 對單一檔案的轉檔 `convertSingleFile` 包裝了 `try-catch`。當單個檔案損毀或轉換失敗時，會拋出例外並記錄為 `success: false`，透過回呼發送 `status: 'error'` 給前端日誌，並繼續處理後續檔案。這確保了批次轉檔的強健性，不會因單一檔案損毀而中斷整個排程。
  * 渲染行程的 `renderer.js` 在發送 `startConversion` 前會停用所有輸入元件（如執行按鈕、資料夾選擇按鈕、遞迴核取方塊），並在 `finally` 區塊中恢復控制項的可用性。此設計確保了若後端轉檔發生未預期崩潰，UI 介面不致於永久鎖死。
* **進度條更新邏輯**：
  * 當掃描後發現沒有任何 HEIC/HEIF 檔案時（`total === 0`），後端會發送 `complete` 狀態，前端會將進度條推至 `100%` 並顯示「轉檔完成！」。在使用者體驗（UX / User Experience）上，這可能會讓使用者誤以為有轉檔成功，建議提示「未發現任何支援的檔案」。
  * 在進度與錯誤回呼中，使用了 `total > 0 ? Math.round((current / total) * 100) : 0` 來計算進度百分比，這有效防範了除以零（Division by Zero）導致的 `NaN` 錯誤。

### 1.3 非同步呼叫的穩定性，以及是否會造成 GUI 凍結（Freeze）
* **主行程/主進程事件循環阻塞風險**：
  * 雖然 `safeConvert`、`convertSingleFile` 與 `runConversion` 皆為非同步（Async）函式，但非同步並不等於多執行緒。
  * HEIC 轉檔（透過 `heic-convert` 庫）與 EXIF 資訊的序列化/反序列化與寫入（透過 `piexif-ts` 與 `exifr` 庫）在底層包含大量的 **CPU 密集型（CPU-intensive）同步運算**。例如：將大檔案讀入為二進位字串 `outputBuffer.toString('binary')`、`piexif.insert` 與 `piexif.dump` 等。
  * 由於 Node.js 是單執行緒（Single-threaded）運作，這些大量的 CPU 密集型同步運算會直接阻塞主行程/主進程的事件循環（Event Loop）。這會導致主行程在處理轉檔時，無法回應作業系統的視窗移動、縮放、最小化/最大化事件，也無法及時回應渲染行程的 IPC 請求，進而**導致 GUI 產生短暫或長期的凍結（App Freezes / Unresponsive）**。

---

## 2. 潛在安全性漏洞與程式錯誤（Bugs）

### 2.1 DOM 型跨網站指令碼（DOM-based XSS）嚴重安全性漏洞 ── 【高風險】
* **漏洞位置**：`src/renderer.js` 第 16-25 行：
  ```javascript
  function appendLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    const timestamp = new Date().toLocaleTimeString();
    logItem.innerHTML = `<span>[${timestamp}]</span> ${message}`; // 漏洞點
    logWindow.appendChild(logItem);
    ...
  }
  ```
* **漏洞成因**：
  * 日誌訊息 `message` 包含了轉換檔案的檔名（如 `details` 中包含的 `fileName`）。由於直接使用 `innerHTML` 將未經過濾與跳脫的檔名寫入 DOM 元件中，若使用者所選取的資料夾內包含惡意命名的檔案（例如 `"><img src=x onerror="alert('XSS')">.heic`），該檔名在轉檔進度更新時會被解析為 HTML 並在渲染行程中執行惡意 JavaScript 腳本。
  * 雖然系統啟用了上下文隔離，但此 XSS 漏洞仍可用於劫持 UI、偽造界面，或利用 preload 曝露的 `electronAPI` 向主行程發送大量請求或進行其他越權操作。
* **修復建議**：
  * 應使用 `textContent` 或 `document.createTextNode` 來安全地加入變數內容，避免將變數作為 HTML 解析。

### 2.2 同步檔案系統 I/O 阻塞 ── 【效能與穩定性風險】
* **漏洞位置**：`src/converter.js` 第 114-130 行 `getUniqueBaseName` 函式：
  ```javascript
  while (true) {
    const jpgPath = path.join(parentDir, `${targetBase}.jpg`);
    const heicPath = path.join(heicSubDir, `${targetBase}.heic`);
    ...
    if (!existsSync(jpgPath) && !existsSync(heicPath) && !existsSync(heifPath)) {
      return targetBase;
    }
    targetBase = `${baseName}_${counter}`;
    counter++;
  }
  ```
* **問題成因**：
  * 在迴圈中重複呼叫同步的 `fs.existsSync`。如果目標資料夾中存在大量重複檔名（例如大量轉檔過的備份檔案），此迴圈會被執行數百甚至數千次，進而產生大量的同步檔案系統 I/O 操作（I/O Operations）。
  * 同步 I/O 會完全鎖定 Node.js 執行緒，加上轉檔程式在主行程中執行，這會直接引發嚴重的 GUI 凍結。
* **修復建議**：
  * 改為非同步的檔案存在檢查，或者在掃描資料夾時，先快取（Cache）目前資料夾中已存在的檔名清單（Set 結構），在記憶體中進行檔名比對，最後才執行檔案寫入。

### 2.3 跨裝置重新命名失敗（Cross-device Link Error） ── 【功能性 Bug】
* **問題位置**：`src/converter.js` 第 177 行：
  ```javascript
  await fs.rename(filePath, movedHeicPath);
  ```
* **問題成因**：
  * `fs.rename` 在同一個實體磁碟分割區（Partition）或磁碟機上能瞬間完成檔案搬移。但如果使用者處理的資料夾位於外接硬碟、網路共享磁碟（NAS）、隨身碟，而目標路徑與系統暫存目錄或不同硬碟分割區跨越了不同的裝置邊界時，作業系統會丟出 `EXDEV: cross-device link not permitted` 的錯誤。
  * 此錯誤會導致 `convertSingleFile` 丟出異常，使該檔案的轉檔與搬移流程中斷並失敗。
* **修復建議**：
  * 應在 `fs.rename` 失敗時，捕獲 `EXDEV` 錯誤，並改用「複製後刪除原始檔」的備用方案（即先執行 `fs.copyFile`，確認成功後再執行 `fs.unlink`）。

---

## 3. 建議優化方向

### 3.1 採用工作執行緒（Worker Threads）或子行程（Child Process）進行轉檔
* **目的**：解決 CPU 密集型運算阻塞主行程導致的 GUI 凍結問題。
* **實作建議**：
  * 將 `converter.js` 封裝至 Electron 的工作執行緒（Worker Threads）或透過 `child_process.fork()` 獨立出來的子行程中執行。
  * 主行程僅作為訊息路由器（Message Router），接收來自渲染行程的 IPC 呼叫後，向子行程/工作執行緒派發任務，並將子行程回傳的進度透過 IPC 轉傳給渲染行程。這能確保主行程的事件循環始終暢通，GUI 介面能維持流暢。

### 3.2 強化 IPC 參數驗證（Parameter Validation）
* **目的**：實施縱深防禦，確保主行程不會因渲染行程傳遞的惡意參數而崩潰或被控制。
* **實作建議**：
  * 在 `index.js` 的 `start-conversion` 中，對傳入的 `dirPath` 進行型別判斷，並利用 `path.isAbsolute` 與檔案系統檢查，確保其為安全合法的絕對路徑。
  * 對 `recursive` 進行布林值（Boolean）強型別驗證。

### 3.3 優化大檔案轉換時的記憶體管理
* **目的**：減少高頻率大緩衝區（Buffer）轉字串所造成的記憶體壓力，防範記憶體溢位（OOM）。
* **實作建議**：
  * 在 `safeConvert` 中，避免呼叫 `toString('binary')` 來將整張圖片載入為大字串。應研究支援直接在 Buffer 或 Stream 層級進行 EXIF 欄位寫入與插入的庫，或者在每次處理大檔案後，主動提示垃圾回收或釋放變數引用，避免變數常駐於記憶體中。

### 3.4 提升 XSS 防禦強度
* **目的**：徹底消除 DOM 型跨網站指令碼安全性漏洞。
* **實作建議**：
  * 在 `renderer.js` 中重構 `appendLog` 方法：
    ```javascript
    function appendLog(message, type = 'info') {
      const logItem = document.createElement('div');
      logItem.className = `log-item log-${type}`;
      
      const timestampSpan = document.createElement('span');
      timestampSpan.textContent = `[${new Date().toLocaleTimeString()}] `;
      logItem.appendChild(timestampSpan);
      
      const messageText = document.createTextNode(message);
      logItem.appendChild(messageText);
      
      logWindow.appendChild(logItem);
      logWindow.scrollTop = logWindow.scrollHeight;
    }
    ```
    使用 `document.createTextNode` 能確保任何輸入的字串皆被視為純文字渲染，不會被網頁瀏覽器解析為 HTML 標籤或指令碼，從根本上杜絕 XSS。
