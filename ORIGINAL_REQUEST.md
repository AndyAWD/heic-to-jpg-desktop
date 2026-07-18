# Original User Request

## Initial Request — 2026-07-18T02:02:22+08:00

# Teamwork Project Prompt

對 `/Users/andyawd/Project/heic-to-jpg` 專案進行全面的程式碼審查 (Code Review)，找出潛在的架構漏洞、效能瓶頸、記憶體洩漏與跨平台相容性問題，並直接對程式碼進行安全地重構與優化。

Working directory: /Users/andyawd/Project/heic-to-jpg
Integrity mode: development

## Requirements

### R1. 全盤性程式碼審查與重構
- 審查 `/src/` 資料夾下的所有程式碼檔案，分析並改善代碼結構、錯誤處理（Error Handling）、記憶體用量與非同步執行穩定性。
- 直接對程式碼進行安全的優化與重構，確保沒有破壞原有的轉檔、搬移、防覆蓋等功能。

### R2. 撰寫繁體中文審查報告
- 在專案根目錄下建立 `code_review_report.md` 檔案。
- 報告內容需包含：發現的潛在問題、最佳化方案、修改前與修改後的程式碼對比，以及優化後的效益說明。

### R3. Git 提交與推送
- 完成重構後，必須使用 `git add` 與 `git commit` 將所有變更提交。
- Git 提交的作者 (Author) 必須明確指定為：`Gemini <218195315+gemini-cli@users.noreply.github.com>`。
- 使用 `git push` 將變更推送至 GitHub 遠端儲存庫。

## Acceptance Criteria

### 1. 功能完整性與穩定性
- [ ] 專案在重構後，Electron GUI 仍能正常啟動並執行轉檔，日誌與進度條無任何異常。
- [ ] CLI 程式能正常載入，語法及執行（帶參數模式或 Inquirer 交談式模式）均完全正常。
- [ ] 原有的轉檔核心（保留 EXIF、無損 quality:1、檔案搬移至 heic/、防覆蓋命名序號）必須維持 100% 正常。

### 2. 審查產物與 Git
- [ ] 專案根目錄下確實存在繁體中文撰寫的 `code_review_report.md` 檔案。
- [ ] 所有的變更與報告檔案均已成功 commit 且 push 到 GitHub。
- [ ] Git commit 的 author 欄位完全符合 `Gemini <218195315+gemini-cli@users.noreply.github.com>`。
