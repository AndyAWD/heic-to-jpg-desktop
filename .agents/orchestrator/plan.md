# Plan

## 階段一：專案探索與分析
- 步驟 1-1：探索 `/Users/andyawd/Project/heic-to-jpg` 專案目錄結構。
- 步驟 1-2：了解專案的架構、主要元件與目前實作方式。
- 步驟 1-3：建立 `/Users/andyawd/Project/heic-to-jpg/PROJECT.md` 全局索引檔案，定義專案架構、里程碑與介面合約。

## 階段二：程式碼審查與問題識別
- 步驟 2-1：指派 `teamwork_preview_explorer` 分析專案 `/src/` 資料夾下的所有程式碼。
- 步驟 2-2：收集 explorer 的報告，找出潛在架構漏洞、效能瓶頸、記憶體洩漏與跨平台相容性問題。
- 步驟 2-3：整理待重構的問題清單。

## 階段三：程式碼重構與最佳化
- 步驟 3-1：指派 `teamwork_preview_worker` 進行安全的代碼重構與最佳化（加強錯誤處理、記憶體最佳化、非同步處理穩定性等），確保不破壞原有轉檔、搬移、防覆蓋等功能。
- 步驟 3-2：要求 worker 進行單元測試與建置驗證。

## 階段四：撰寫審查報告
- 步驟 4-1：指派 worker 在專案根目錄撰寫繁體中文 `code_review_report.md`，內容需包含發現問題、最佳化方案、修改前後對比與最佳化效益。
- 步驟 4-2：指派 `teamwork_preview_reviewer` 對修改過的程式碼與審查報告進行全面審查。
- 步驟 4-3：指派 `teamwork_preview_challenger` 驗證 GUI 與 CLI 程式在重構後的功能完整性。
- 步驟 4-4：指派 `teamwork_preview_auditor` 進行誠信審查，確保無任何作弊、硬編碼或規避行為。

## 階段五：Git 提交與推送
- 步驟 5-1：指派 worker 使用 Git 提交所有變更，並指定作者為 `Gemini <218195315+gemini-cli@users.noreply.github.com>`，隨後推送至遠端儲存庫。
- 步驟 5-2：驗證 GitHub 推送結果與最終狀態，並向 sentinel 報告 completion。
