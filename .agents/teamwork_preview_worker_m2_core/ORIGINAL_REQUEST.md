# Original User Request

## Initial Request — 2026-07-18T09:11:36+08:00

你已被指派為 teamwork_preview_worker_m2_core (由 self 代理)。
你的工作目錄是 `/Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2_core`。
請在此目錄中建立你的 `progress.md`。

任務：
請對 `src/converter.js` 進行安全重構與優化，並對 `package.json` 進行依賴項修正。具體要求如下：

1. **修正 EXIF 旋轉與寬高補正邏輯 Bug**：
   在 `src/converter.js` 的 `safeConvert` 函式中，修正 Orientation 補正的先後順序錯誤，確保若 Orientation 大於 4 時，PixelXDimension 與 PixelYDimension 會正確互換，最後再將 Orientation 覆寫為 1。

2. **修正跨裝置檔案搬移問題 (EXDEV Error)**：
   在 `src/converter.js` 中，將原始檔搬移到 heic 資料夾時，若 `fs.rename` 丟出 `EXDEV` 錯誤，請實作降級 fallback：先使用 `fs.copyFile` 複製檔案，複製成功後再使用 `fs.unlink` 刪除原始檔案。

3. **解決同步 I/O 阻塞與批次轉檔的記憶體控制問題**：
   - 將 `src/converter.js` 中的 `getUniqueBaseName` 裡反覆重複呼叫的同步 `fs.existsSync` 改為非同步的檔案存在檢查（可以使用 fs.promises.access 等），以防阻塞主事件循環。
   - 在 `src/converter.js` 中批次轉檔時實作併發控制（Concurrency Control）限制。可利用 Promise 併發限制機制（限制最多併發數，例如系統 CPU 核心數減 1，且最少為 1），既能發揮平行運算效能，又能避免大量批次轉檔時載入過多 Buffer 導致記憶體洩漏與 OOM。
   
4. **補齊 package.json 的直接依賴項**：
   在 `package.json` 的 `dependencies` 中明確加入 `exifr`、`heic-convert` 以及 `piexif-ts`。

5. **維持轉檔功能 100% 正常**：
   所有重構不得破壞原有轉檔核心功能（保留 EXIF、無損 quality:1、檔案搬移至 heic/、防覆蓋命名序號）。

完成後，在你的工作目錄撰寫一份繁體中文的 `handoff.md`（說明修改處與實作邏輯），並向 parent (本 conversation ID) 發送 handoff 訊息。

MANDATORY INTEGRITY WARNING：
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
