# BRIEFING — 2026-07-18T09:11:36+08:00

## Mission
對 src/converter.js 進行安全重構與優化（EXIF 旋轉、跨裝置搬移 fallback、非同步 I/O、併發限制），並修正 package.json 依賴項。

## 🔒 My Identity
- Archetype: teamwork_preview_worker_m2_core
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2_core
- Original parent: parent
- Original parent conversation ID: a5264b1c-f344-44b1-bf64-2fcf800a4ed8

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2_core/SCOPE.md
1. **Decompose**: 將重構與優化任務拆解成五個具體的工作項目（EXIF 旋轉修正、EXDEV 搬移 fallback、getUniqueBaseName 非同步化、批次轉檔併發限制、package.json 依賴項修正）。
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: 使用 Explorer -> Worker -> Reviewer -> Challenger -> Auditor 循環。
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: 在累積衍生子代理達 16 個且所有子代理完成後，撰寫 handoff.md，啟動繼承者並退出。
- **Work items**:
  1. 修正 EXIF 旋轉與寬高補正邏輯 Bug [pending]
  2. 修正跨裝置檔案搬移問題 (EXDEV Error) [pending]
  3. 解決 getUniqueBaseName 同步 I/O 阻塞 [pending]
  4. 解決批次轉檔的記憶體控制與併發限制 [pending]
  5. 補齊 package.json 的直接依賴項 [pending]
- **Current phase**: 1
- **Current focus**: 探索當前程式碼結構與現有測試

## 🔒 Key Constraints
- 所有回應請使用繁體中文，採用台灣慣用的詞彙和表達方式，專有名詞使用「中文翻譯（英文原文）」格式。
- 絕不直接修改、撰寫或建立原始碼檔案。
- 絕不自己執行建置/測試命令，必須要求 Worker 執行。
- 在每個子代理交付 handoff 後絕不重複使用該子代理，必須每次都派生（spawn）新的子代理。
- 若 Forensic Auditor 回報 INTEGRITY VIOLATION，里程碑無條件失敗，不得推進。

## Current Parent
- Conversation ID: a5264b1c-f344-44b1-bf64-2fcf800a4ed8
- Updated: not yet

## Key Decisions Made
- [TBD]

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|

## Succession Status
- Succession required: no
- Spawn count: 0 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: not started
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run manage_task(Action="list") — re-create if missing

## Artifact Index
- /Users/andyawd/Project/heic-to-jpg/.agents/teamwork_preview_worker_m2_core/ORIGINAL_REQUEST.md — 原始使用者需求記錄
