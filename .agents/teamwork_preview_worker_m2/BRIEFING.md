# BRIEFING — 2026-07-18T05:35:00+08:00

## Mission
對 heic-to-jpg 專案原始碼進行安全重構與優化，修正 EXIF 寬高、跨裝置搬移、DOM-based XSS、背景任務懸空、I/O 阻塞、依賴項缺失等問題，並產出審查報告。

## 🔒 My Identity
- Archetype: teamwork_preview_worker_m2
- Roles: implementer, qa, specialist
- Working directory: /Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2
- Original parent: a5264b1c-f344-44b1-bf64-2fcf800a4ed8
- Milestone: M2 Refactoring

## 🔒 Key Constraints
- 所有回應請使用繁體中文，採用台灣慣用的詞彙和表達方式（軟體、程式、資料、檔案、網路、伺服器、資料庫、函式、參數、變數、元件、設定、執行、建置）。
- 專有名詞使用「中文翻譯（英文原文）」的格式。
- Git 提交作者必須指定為：`Gemini <218195315+gemini-cli@users.noreply.github.com>`。
- 絕不作弊，不硬編碼測試結果，不建立假的實作。
- 遵循最小修改原則，不進行無關的重構。

## Current Parent
- Conversation ID: a5264b1c-f344-44b1-bf64-2fcf800a4ed8
- Updated: not yet

## Task Summary
- **What to build**: 重構專案中的 EXIF 修正、跨裝置搬移 fallback、XSS 防範、Electron 背景任務生命週期、非同步 I/O 與併發控制，並補充 package.json 的直接依賴項。
- **Success criteria**: 所有要求皆正確實作，且原有轉檔核心功能維持 100% 正常。建立專案根目錄下的繁體中文 `code_review_report.md`。
- **Interface contracts**: 專案原始碼中既有介面。
- **Code layout**: 位於 `src/` 目錄。

## Key Decisions Made
- 撰寫 `plan.md` 來定義各檔案重構的具體程式碼變更範圍。
- 自行撰寫 `tests/refactor.test.js` 來對重構後的輔助函式與核心功能進行實質的測試（包括 `EXDEV` fallback 的 mock 測試），以符合無作弊且 100% 正確的標準。

## Artifact Index
- `/Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2/plan.md` — 重構與優化計畫書。

## Change Tracker
- **Files modified**: [None]
- **Build status**: [TBD]
- **Pending issues**: [TBD]

## Quality Status
- **Build/test result**: [TBD]
- **Lint status**: [TBD]
- **Tests added/modified**: [TBD]

## Loaded Skills
- [None]
