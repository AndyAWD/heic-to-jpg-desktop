## 2026-07-18T05:07:30+08:00
你已被指派為 teamwork_preview_worker_m2。
你的工作目錄是 `/Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2`。
請在此目錄中建立你的 `progress.md`。

任務：
請對專案原始碼進行安全重構與優化，並產出審查報告。具體要求如下：

1. **修正 EXIF 旋轉與寬高補正邏輯 Bug**：
   在 `src/converter.js` 中，修正 Orientation 補正的先後順序錯誤，確保若 Orientation 大於 4 時，PixelXDimension 與 PixelYDimension 會正確互換，最後再將 Orientation 覆寫為 1。
   
2. **修正跨裝置檔案搬移問題 (EXDEV Error)**：
   在 `src/converter.js` 中，將原始檔搬移到 heic 資料夾時，若 `fs.rename` 丟出 `EXDEV` 錯誤，請實作降級 fallback：先使用 `fs.copyFile` 複製檔案，複製成功後再使用 `fs.unlink` 刪除原始檔案。

3. **修正 DOM 型跨網站指令碼 (DOM-based XSS) 嚴重漏洞**：
   在 `src/renderer.js` 的 `appendLog` 函式中，停止使用 `innerHTML` 拼接日誌，改用 `document.createTextNode` 或 `textContent` 安全地渲染檔名與日誌內容，防止惡意檔名注入 XSS 攻擊。

4. **防止 Electron 背景轉檔任務懸空**：
   引入控制機制，若使用者在轉檔過程中關閉主視窗，轉檔任務必須被終止或安全退出（可以透過 AbortController，或是在 `src/index.js` 的 `window-all-closed` 或視窗 close事件中強制呼叫 `app.quit()` 中止所有行程）。

5. **解決 CPU 密集型轉檔阻塞事件循環與同步 I/O 阻塞問題**：
   - 將 `src/converter.js` 中的 `getUniqueBaseName` 裡反覆重複呼叫的同步 `fs.existsSync` 改為非同步的檔案存在檢查，以防阻塞。
   - 在批次轉檔時實作併發控制（Concurrency Control）限制。可利用 Promise 併發限制機制（限制最多併發數，例如系統 CPU 核心數減 1，且最少為 1），既能發揮平行運算效能，又能避免大量批次轉檔時載入過多 Buffer 導致記憶體洩漏與 OOM。
   - 確保渲染進程在視窗卸載前，清除 preload 中 `onConversionProgress` 返回的事件監聽器，防止 Listener 洩漏。

6. **補齊 package.json 的直接依賴項**：
   在 `package.json` 的 `dependencies` 中明確加入 `exifr`、`heic-convert` 以及 `piexif-ts`。

7. **產出審查報告**：
   重構完成後，在專案根目錄下建立繁體中文（台灣習慣用語）的 `code_review_report.md` 檔案，內容需包含：
   - 發現的潛在問題與安全漏洞說明。
   - 最佳化重構方案。
   - 修改前與修改後的程式碼對比 (Diff)。
   - 優化後的效益說明。

8. **維持功能 100% 正常**：
   所有重構不得破壞原有轉檔核心功能（保留 EXIF、無損 quality: 1、檔案搬移至 heic/、防覆蓋命名序號）。

MANDATORY INTEGRITY WARNING：
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
