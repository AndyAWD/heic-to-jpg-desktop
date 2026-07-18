# Project: heic-to-jpg

## Architecture
- **轉檔核心 (src/converter.js)**: 提供單張與多張 HEIC 轉 JPG 的功能，保留 EXIF 資訊，無損 quality:1，搬移至 heic/ 資料夾，並具備防覆蓋的命名序號機制。
- **GUI 入口 (src/index.js, preload.js, renderer.js)**: 基於 Electron，提供圖形介面以載入、選擇、執行轉檔，顯示日誌與進度條。
- **CLI 入口 (src/cli.js)**: 提供命令列界面，支援帶參數模式（Commander）與交談式模式（Inquirer）。

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | 專案審查與漏洞識別 | 分析全專案代碼，產出審查分析報告，定案重構策略。 | None | DONE |
| 2 | 轉檔核心重構與優化 | 重構 `converter.js`，加入強健的錯誤處理、記憶體與效能最佳化、跨平台路徑處理。 | M1 | IN_PROGRESS |
| 3 | GUI 與 CLI 重構 | 重構 `index.js`, `cli.js`, `renderer.js`，修補非同步安全與記憶體洩漏，優化介面互動。 | M2 | PLANNED |
| 4 | 撰寫審查報告與全面驗證 | 撰寫 `code_review_report.md`，進行 Reviewer 審查、Challenger 驗證與 Auditor 誠信稽核。 | M3 | PLANNED |
| 5 | Git 提交與推送 | 以指定作者身份 commit 並 push 到 GitHub。 | M4 | PLANNED |

## Interface Contracts
### converter.js ↔ cli.js / renderer.js
- `convertHeicToJpg(inputPath, options)`
  - 輸入參數：`inputPath` (字串或陣列，表示輸入檔案/資料夾路徑)，`options` (設定物件，例如是否保留 EXIF、輸出路徑等)。
  - 回傳值：Promise，解析為轉檔結果物件（包含成功數量、失敗數量、輸出路徑清單等）。
  - 錯誤處理：捕獲所有例外，不使程式崩潰，並回傳明確的錯誤訊息。

## Code Layout
- `src/index.js` - Electron 主行程進入點
- `src/preload.js` - Electron 預載腳本
- `src/renderer.js` - Electron 渲染行程邏輯
- `src/converter.js` - 轉檔核心邏輯
- `src/cli.js` - CLI 進入點
- `src/ui/` - GUI 靜態資源 (HTML/CSS)
