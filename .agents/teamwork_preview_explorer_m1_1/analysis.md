# 程式碼審查與分析報告

## 1. 摘要 (Summary)
本報告針對 `heic-to-jpg` 專案中的 `src` 目錄進行了全面的程式碼審查，並「特別著重」於 `src/converter.js` 與 `src/cli.js`。
審查發現：專案架構設計清晰，具備良好的模組化與安全 IPC 機制，且在錯誤處理上表現出高度的防禦性（Defensive Programming）設計。然而，程式碼中存在一個**重大邏輯錯誤（Bug）**，會導致旋轉過的照片在 EXIF 寬高元資料（Metadata）補正上完全失效；此外亦發現**缺少直接依賴項（Missing Direct Dependencies）**以及 **Electron 背景任務懸空（Dangling Task）**等問題。本報告對此提出具體優化方向與修正 Diff 補丁（Patch）。

---

## 2. 程式碼結構與設計模式 (Code Structure & Design Patterns)

### 2.1 模組化與架構設計
- **前後端分離 (Main-Renderer Process)**：專案基於 Electron 架構，將核心轉檔邏輯移至 `src/converter.js`（Node.js 環境），UI 渲染與使用者互動位於 `src/renderer.js` 與 `src/ui/index.html`（Chromium 環境）。
- **IPC 安全通訊**：採用 Electron 推薦的安全最佳實踐。在 `src/preload.js` 中使用 `contextBridge.exposeInMainWorld` 與 `ipcRenderer.invoke`，將通訊介面限縮於 `selectDirectory`、`start-conversion` 與進度監聽，且關閉了渲染行程的 `nodeIntegration`，啟用 `contextIsolation`，防範潛在的惡意程式碼注入。
- **CLI 與核心邏輯解耦**：`src/cli.js` 引用 `src/converter.js`，將轉檔引擎與使用者介面（GUI 與 CLI）完全解耦，提升了程式碼的可重用性。

### 2.2 設計模式
- **觀察者模式 (Observer Pattern)**：`src/converter.js` 中的 `runConversion` 函式接受一個 `onProgress` 回呼函式（Callback）。在轉檔的各個生命週期（`scanning`、`processing`、`progress`、`error`、`complete` 等）主動通知訂閱者，實現了非同步進度回饋的低耦合設計。
- **退化/降級設計 (Fallback Design)**：在轉檔過程中，如果 EXIF 解析或注入發生任何錯誤，系統會自動退化為「直接無失真轉檔（不注入 EXIF）」，確保核心功能不會因為元資料損毀而完全無法使用。

---

## 3. 錯誤處理 (Error Handling) 機制評估

專案的錯誤處理機制相當健全且具備防禦性：
1. **單一檔案容錯**：在 `runConversion` 當中，使用 `for (const file of files)` 循序轉檔，並對每個檔案的 `convertSingleFile(file)` 都使用獨立的 `try...catch` 包覆。單一檔案轉檔失敗會被記錄在 `results` 陣列，並繼續處理下一個檔案，避免因單一檔案毀損導致整個批次任務中斷。
2. **暫存檔案清理**：在 `convertSingleFile` 中，若轉檔中途失敗或檔案搬移（`fs.rename`）出錯，會在 `catch` 區塊中嘗試以 `fs.unlink` 清理已產生的 JPG 暫存檔，確保不留下垃圾檔案。
3. **安全防禦退化**：在 `safeConvert` 中，對 EXIF 解析器 `Exifr` 的讀取、解析及 `piexif.insert` 皆包覆在 `try...catch` 中。若 EXIF 異常，會執行 fallback 區塊（91-102行），再次嘗試進行純轉檔。
4. **全域與頂層捕捉**：`src/index.js` 的 `ipcMain.handle` 與 `src/cli.js` 的 `start` 函式均有頂層的 `try...catch`，可捕捉未被處理的嚴重例外（如目錄讀取失敗、磁碟空間不足等），並通知前端或安全退出。

---

## 4. 非同步執行的穩定性 (Asynchronous Execution Stability)

- **非同步 I/O**：使用 Node.js 原生的 `fs/promises` 進行非同步檔案讀寫與目錄操作，避免阻塞 Node.js 的主事件循環（Main Event Loop）。
- **循序非同步 (Sequential Execution)**：目前採用 `await` 逐一處理檔案。
  - **優點**：由於 HEIC 轉檔（`heic-convert`）為 CPU 密集型與記憶體密集型任務（特別是 WASM 版本的解碼與編碼），循序處理可有效控制記憶體佔用（防止 Out of Memory, OOM）與 CPU 核心負載，避免程式當機。
  - **缺點**：無法發揮多核心處理器的優勢，對於處理大量相片時，效能表現較為受限。

---

## 5. 潛在 Bug、漏洞與效能改善空間

### 🐛 Bug A：EXIF 旋轉與寬高元資料（Metadata）補正邏輯失效 (重大)
- **問題分析**：
  在 `src/converter.js` 中，程式碼試圖在圖片旋轉大於 4 時互換 EXIF 中的寬度（`PixelXDimension`）與高度（`PixelYDimension`），但卻在檢查條件之前先將 Orientation 覆寫為 1：
  ```javascript
  64:       ifd0[piexif.TagValues.ImageIFD.Orientation] = 1;
  65:       if (ifd0[piexif.TagValues.ImageIFD.Orientation] > 4) {
  66:         const xd = exif[piexif.TagValues.ExifIFD.PixelXDimension];
  67:         const yd = exif[piexif.TagValues.ExifIFD.PixelYDimension];
  68:         exif[piexif.TagValues.ExifIFD.PixelXDimension] = yd;
  69:         exif[piexif.TagValues.ExifIFD.PixelYDimension] = xd;
  70:       }
  ```
  因為第 64 行已將 Orientation 強制設為 `1`，所以第 65 行的 `1 > 4` 條件永遠為 `false`，寬高互換邏輯永遠不會執行。
- **後果**：
  `heic-convert` 轉出來的 JPG 實體像素是轉正後的（例如寬 4032, 高 3024），但注入的 EXIF 中記錄的寬高卻維持原圖寬高（例如寬 3024, 高 4032）。這會造成影像實體尺寸與 EXIF 寬高資料不符，導致相簿軟體讀取錯誤或圖片變形。
- **修復方案**：
  先進行條件檢查與寬高互換，最後再重置 Orientation 為 1。

---

### 🐛 Bug B：缺少直接依賴項 (Missing Direct Dependencies) (中等)
- **問題分析**：
  `src/converter.js` 直接使用 `require` 載入 `heic-convert`、`piexif-ts` 以及 `exifr`：
  ```javascript
  4: const { Exifr } = require('exifr');
  5: const heicConvert = require('heic-convert');
  6: const piexif = require('piexif-ts');
  ```
  但 `package.json` 中的 `dependencies` **完全沒有**聲明這三個套件：
  ```json
  "dependencies": {
    "heic-jpg-exif": "^1.0.2",
    "commander": "^11.1.0",
    "inquirer": "^9.2.12",
    "ora": "^5.4.1",
    "chalk": "^4.1.2"
  }
  ```
- **後果**：
  雖然目前在開發環境下，這些套件可能因 `heic-jpg-exif` 套件內部依賴而在安裝時被 npm 扁平化（Flatten）放入 `node_modules` 中；但在乾淨的生產環境、CI/CD 流程、或使用 `pnpm` / `yarn berry` 等嚴格依賴隔離的套件管理器時，執行程式將因找不到模組而直接崩潰（`Cannot find module`）。
- **修復方案**：
  將 `heic-convert`、`piexif-ts`、`exifr` 明確加入 `package.json` 的 `dependencies`。

---

### 🐛 Bug C：Electron 視窗生命週期與背景任務懸空問題 (中等)
- **問題分析**：
  在 `src/index.js` 中，`start-conversion` 是一個長時間執行的非同步 IPC 處理程序。
  如果使用者在轉檔過程中，手動關閉了 Electron 主視窗，因為 macOS 的預設行為（`window-all-closed` 在 macOS 上不結束應用程式），`mainWindow` 被設為 `null`，但非同步轉檔程序仍會繼續執行。
- **後果**：
  1. 進度無法回傳，且背景任務無法被取消。
  2. 若使用者重新打開應用程式視窗，會建立新的 `mainWindow`，此時舊的任務依然在背景執行，若使用者再次啟動轉檔，會對相同資料夾進行重複轉換，造成嚴重的 Race Condition 與檔案衝突。
- **修復方案**：
  引入 `AbortController` 機制，在視窗關閉（`mainWindow.on('closed')`）時呼叫 `abort()` 以中斷 `runConversion` 中的迴圈；或者在視窗關閉時主動調用 `app.quit()`。

---

### ⚡ 效能與功能優化建議

1. **併發控制 (Concurrency Control)**
   目前循序處理雖安全，但在多核心 CPU 電腦上速度較慢。建議引入類似 `p-limit` 的機制，或是自訂 Promise 限制池，允許同時處理數等於 `os.cpus().length`，既能保障不致 OOM，又能成倍提升轉檔速度。
2. **轉檔品質參數 (Quality Parameter) 曝露**
   底層 `safeConvert` 已支援 `quality` 參數，但 UI 和 CLI 均寫死為 `1`。建議在 CLI 增加 `--quality <0-1>` 參數，並在 UI 提供滑桿，讓使用者自訂壓縮率。
3. **沙盒與獨立進程化 (Worker Process)**
   由於 HEIC 轉檔非常吃重 CPU，若在 Main Process 中執行，可能會導致 GUI 出現短暫卡頓。建議使用 Electron 的 `utilityProcess` 或 Node 的 `Worker Threads` 來跑轉檔，徹底將 CPU 密集運算與主進程隔離。

---

## 6. 建議的程式碼修正補丁 (Proposed Patch)

### 補丁 1：修正 EXIF 旋轉寬高補正邏輯
修正 `src/converter.js` 中的 `safeConvert` 函式：

```diff
diff --git a/src/converter.js b/src/converter.js
--- a/src/converter.js
+++ b/src/converter.js
@@ -61,12 +61,12 @@
       exif = formatTypes('Exif', exif);
       gps = formatTypes('GPS', gps);
 
-      ifd0[piexif.TagValues.ImageIFD.Orientation] = 1;
       if (ifd0[piexif.TagValues.ImageIFD.Orientation] > 4) {
         const xd = exif[piexif.TagValues.ExifIFD.PixelXDimension];
         const yd = exif[piexif.TagValues.ExifIFD.PixelYDimension];
         exif[piexif.TagValues.ExifIFD.PixelXDimension] = yd;
         exif[piexif.TagValues.ExifIFD.PixelYDimension] = xd;
       }
+      ifd0[piexif.TagValues.ImageIFD.Orientation] = 1;
 
       const exifBytes = piexif.dump({
```

### 補丁 2：補齊 `package.json` 中的直接依賴項
修正 `package.json` 中的 `dependencies` 區塊：

```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -13,9 +13,12 @@
   "dependencies": {
     "heic-jpg-exif": "^1.0.2",
+    "exifr": "^7.1.3",
+    "heic-convert": "^2.1.0",
+    "piexif-ts": "^2.0.0-beta.2",
     "commander": "^11.1.0",
     "inquirer": "^9.2.12",
     "ora": "^5.4.1",
     "chalk": "^4.1.2"
   },
```
*(版本號可根據當前 `node_modules` 中實際安裝的版本進行鎖定)*
