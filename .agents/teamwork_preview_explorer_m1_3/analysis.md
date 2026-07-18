# HEIC to JPG 轉檔工具程式碼審查報告

## 摘要
本報告針對 `heic-to-jpg-desktop` 專案中的 `/src` 目錄程式碼進行審查。發現之核心漏洞為：在轉檔過程中，大容量 Buffer 與二進位字串（Binary String）同時存在於記憶體中，缺乏併發控制與 GC 回收延遲，導致大量轉檔時極易發生記憶體不足（Out of Memory, OOM）崩潰；此外，使用 `fs.rename` 進行跨磁碟分割區搬移時將會觸發 `EXDEV` 錯誤而中斷；轉檔採用序列化同步等待模式，無法發揮多核心處理器效能。

---

## 1. 記憶體洩漏與資源釋放（Memory Leaks & Resource Management）

### 1.1 大容量影像資料的重複記憶體分配
- **檔案位置**：`src/converter.js` (`safeConvert` 函式，第 12 至 109 行)
- **程式碼片段**：
  ```javascript
  const fileData = await fs.readFile(inputPath); // 讀取 HEIC 檔案
  ...
  const imgData = outputBuffer.toString('binary'); // 轉為 binary string
  const newData = piexif.insert(exifBytes, imgData); // 插入 EXIF 資訊
  newJpeg = Buffer.from(newData, 'binary'); // 轉回 Buffer
  ```
- **漏洞分析**：
  在單次轉檔流程中，記憶體中會同時堆積多個暫時性的大型變數：
  1. `fileData`：原始 HEIC 檔案的緩衝區（Buffer）（約 10 ~ 30 MB）
  2. `outputBufferArray` / `outputBuffer`：轉換後未壓縮的 JPEG 緩衝區（Buffer）（約 5 ~ 15 MB）
  3. `imgData`：轉換為二進位字串（Binary String）的 JPEG 資料（約 5 ~ 15 MB，且在 JavaScript 引擎中，字串佔用的記憶體空間通常大於同等大小的 Buffer）
  4. `newData`：注入可交換影像檔案格式（EXIF）資料後的二進位字串（Binary String）（約 5 ~ 15 MB）
  5. `newJpeg`：最終寫入磁碟的 JPEG 緩衝區（Buffer）（約 5 ~ 15 MB）
  
  在轉換一張 20MB 的相片時，記憶體峰值可能瞬間高達其檔案大小的 **4 至 5 倍**。雖然這些區域變數在函式執行結束後會解除引用，但由於垃圾回收（Garbage Collection, GC）的執行存在延遲，當使用者批次處理大量檔案時，新分配的記憶體速度遠大於回收速度，將直接導致記憶體耗盡（OOM）崩潰。

### 1.2 Electron 處理序監聽器未清理 (Listener Leaks)
- **檔案位置**：`src/preload.js` (第 6-12 行) 與 `src/renderer.js` (第 87-120 行)
- **漏洞分析**：
  在 `preload.js` 中，`onConversionProgress` 返回了一個用於取消註冊監聽器的回呼（Callback）函式：
  ```javascript
  onConversionProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('conversion-progress', subscription);
    return () => ipcRenderer.removeListener('conversion-progress', subscription);
  }
  ```
  然而，在 `renderer.js` 中，該方法在全域被呼叫，且**完全沒有保存或調用**其返回的清理函式。如果應用程式視窗在執行期間被重新整理（Reload）或重新導向，舊的監聽器將會殘留在 Electron 的行程中，引發監聽器洩漏（Listener Leaks），導致每次重整後記憶體用量增加，且進度通知被重複執行。

---

## 2. 跨平台相容性（Cross-platform compatibility）

### 2.1 跨磁碟分割區搬移檔案失敗（EXDEV 錯誤）
- **檔案位置**：`src/converter.js` (`convertSingleFile` 函式，第 177 行)
- **程式碼片段**：
  ```javascript
  // 將原始檔搬移到 heic 子目錄下
  await fs.rename(filePath, movedHeicPath);
  ```
- **漏洞分析**：
  `fs.rename` (在作業系統底層對應 `rename` 系統呼叫) 在搬移檔案時，若來源路徑與目標路徑位於不同的檔案系統磁碟分割區（例如：從本機硬碟搬移到外接隨身碟、網絡共享資料夾，或者在 Linux/macOS 下不同的掛載點（Mount Point）時），將會拋出 `EXDEV: cross-device link not permitted` 錯誤。
  
  雖然程式碼中目標目錄 `heicDir` 是在原始檔案的同層目錄下建立：
  ```javascript
  const dir = path.dirname(filePath);
  const heicDir = path.join(dir, 'heic');
  ```
  但在某些特殊的系統設定下（例如 `heic` 資料夾本身是一個指向其他硬碟分割區的符號連結（Symbolic Link）、掛載點，或是處於分散式檔案系統中），`fs.rename` 就會報錯中斷，無法順利完成轉檔後的搬移。

### 2.2 Windows 拖曳路徑之引號處理
- **檔案位置**：`src/cli.js` (第 38 與 51 行)
- **漏洞分析**：
  在 Windows 終端機（如 cmd 或 PowerShell）中，將資料夾拖入視窗時，路徑前後會自動加上雙引號。程式碼中使用：
  ```javascript
  const trimmed = input.trim().replace(/^['"]|['"]$/g, '');
  ```
  如果拖曳的路徑中包含空格，且引號前後夾帶了其他控制字元，或是拖入多個資料夾，此正則表達式可能無法正確過濾，導致 `fs.existsSync` 回傳 `false` 並中斷程式。

---

## 3. 效能瓶頸（Performance bottlenecks）

### 3.1 序列化轉換導致多核心 CPU 閒置
- **檔案位置**：`src/converter.js` (`runConversion` 函式，第 212 至 230 行)
- **漏洞分析**：
  目前的批次轉檔採用單純的 `for...of` 搭配 `await`：
  ```javascript
  for (const file of files) {
    ...
    const res = await convertSingleFile(file);
    ...
  }
  ```
  這是一種**序列化（Sequential / Blocking）**的執行流程。HEIC 解碼與 JPEG 編碼皆屬於高度消耗處理器運算（CPU-bound）的作業。在現代多核心處理器的電腦上，序列化執行會導致只有單一 CPU 核心處於忙碌狀態，其餘核心皆處於閒置，極大拉長了批次轉檔的總耗時。

### 3.2 缺乏併發控制（Concurrency Control）的兩難
- **漏洞分析**：
  若直接將序列化改為 `Promise.all`（並行處理），會導致所有相片轉檔工作同時被載入記憶體。如第 1 點所述，由於單張轉檔所需的記憶體開銷為相片檔案的數倍，在缺乏併發控制（例如：限制最多同時處理 4 張相片）的情況下，高併發將直接引發主行程的記憶體崩潰（OOM）。

---

## 4. 建議優化方向

### 4.1 記憶體優化：避免使用二進位字串（Binary String）
建議改用原生 Buffer 來處理 EXIF 資料與 JPEG 二進位資料的拼接，避免使用消耗大量記憶體且低效的 `piexif.insert` 與 `toString('binary')`。可尋求支援 Buffer 的 EXIF 寫入庫，或手動透過 Buffer 拼接方式注入 EXIF 欄位。

### 4.2 跨平台相容性優化：降級（Fallback）檔案搬移方案
在檔案搬移時，捕捉 `EXDEV` 錯誤。若觸發此錯誤，則降級為先複製檔案，再刪除原始檔案：
```javascript
async function safeRename(src, dest) {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}
```

### 4.3 效能優化：引入併發限制佇列（Concurrency Limit Queue）
使用併發控制庫（例如 `p-limit`）或自行實作輕量級的併發限制佇列，並根據系統的 CPU 核心數量（`os.cpus().length`）或預設上限（如 4），來平衡 CPU 的利用率與記憶體佔用：
```javascript
const pLimit = require('p-limit');
const limit = pLimit(Math.max(1, os.cpus().length - 1)); // 留一個核心給 UI 執行序

const tasks = files.map(file => limit(() => convertSingleFile(file)));
const results = await Promise.all(tasks);
```

### 4.4 記憶體管理：優化進度監聽器的生命週期
在 `renderer.js` 中保存 `onConversionProgress` 返回的清理函式，並在視窗即將卸載（`beforeunload`）或重新整理時執行清理，避免行程中累積無效監聽器。
