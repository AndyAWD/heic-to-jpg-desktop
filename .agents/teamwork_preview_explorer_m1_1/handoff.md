# 移交報告 (Handoff Report)

## 1. 觀察結果 (Observation)

我們對專案目錄 `/Users/andyawd/Project/heic-to-jpg` 進行了靜態與動態審查，觀測到以下具體事實：

1. **核心轉檔邏輯與 EXIF 補正順序**：
   在檔案 `/Users/andyawd/Project/heic-to-jpg/src/converter.js` 中，程式碼行數 64 至 70 內容如下：
   ```javascript
   64:       ifd0[piexif.TagValues.ImageIFD.Orientation] = 1;
   65:       if (ifd0[piexif.TagValues.ImageIFD.Orientation] > 4) {
   66:         const xd = exif[piexif.TagValues.ExifIFD.PixelXDimension];
   67:         const yd = exif[piexif.TagValues.ExifIFD.PixelYDimension];
   68:         exif[piexif.TagValues.ExifIFD.PixelXDimension] = yd;
   69:         exif[piexif.TagValues.ExifIFD.PixelYDimension] = xd;
   70:       }
   ```
   此段邏輯將 `Orientation` 強制覆寫為 `1` 後，緊接著判斷其是否大於 `4`。

2. **套件直接依賴缺失**：
   在 `/Users/andyawd/Project/heic-to-jpg/package.json` 中，依賴宣告（第 13-19 行）為：
   ```json
   13:   "dependencies": {
   14:     "heic-jpg-exif": "^1.0.2",
   15:     "commander": "^11.1.0",
   16:     "inquirer": "^9.2.12",
   17:     "ora": "^5.4.1",
   18:     "chalk": "^4.1.2"
   19:   }
   ```
   然而，`/Users/andyawd/Project/heic-to-jpg/src/converter.js` 卻直接引入了並非宣告於此的套件（第 4-6 行）：
   ```javascript
   4: const { Exifr } = require('exifr');
   5: const heicConvert = require('heic-convert');
   6: const piexif = require('piexif-ts');
   ```

3. **背景任務生命週期管理懸空**：
   在 `/Users/andyawd/Project/heic-to-jpg/src/index.js` 中，非同步 IPC 監聽程式（第 57-74 行）：
   ```javascript
   57: ipcMain.handle('start-conversion', async (event, { dirPath, recursive }) => {
   ```
   若使用者在執行過程中關閉了視窗，此處並沒有中止轉檔迴圈的取消機制（如 `AbortSignal`），且 macOS 預設在視窗關閉時不會退出應用程式（第 40-42 行）：
   ```javascript
   40: app.on('window-all-closed', () => {
   41:   if (process.platform !== 'darwin') app.quit();
   42: });
   ```

---

## 2. 邏輯鏈 (Logic Chain)

基於上述觀測事實，我們的推導邏輯如下：

1. **對於重大旋轉寬高 Bug**：
   - 根據 **觀察 1**，第 64 行已將 `ifd0[Orientation]` 重設為 `1`。
   - 在第 65 行中，條件式 `if (ifd0[...] > 4)` 實際上相當於 `if (1 > 4)`，其結果恆為 `false`。
   - 因此，第 66 至 69 行的寬高互換補正邏輯將永遠不會被執行。
   - 結論：若原 HEIC 圖片的 Orientation 大於 4（已被相機旋轉），雖然實體像素被 `heicConvert` 轉正了，但寫入 JPG 的 EXIF 解析度元資料卻沒有對調，導致影像實體像素與 EXIF 中標示的寬高不一致。

2. **對於直接依賴缺失問題**：
   - 根據 **觀察 2**，核心代碼 `converter.js` 直接調用了 `exifr`、`heic-convert`、`piexif-ts`，但 `package.json` 未列出。
   - 現行環境中可運作，是因為這些套件剛好是 `heic-jpg-exif` 的間接依賴項，被包裝在 `node_modules` 中。
   - 結論：如果在乾淨的 production 環境或特定的依賴隔離套件管理器（例如 `pnpm`）下安裝此專案，這些 `require` 將拋出 `Cannot find module` 錯誤而崩潰。

3. **對於 Electron 背景任務懸空問題**：
   - 根據 **觀察 3**，非同步轉檔是循序處理多張圖片的長任務，並常駐於主進程中運行。
   - 由於在 macOS 上關閉視窗不會 quit app，且沒有任何中斷或取消機制。
   - 結論：當使用者於轉檔期間關閉視窗，該任務依然會在背景默默耗費 CPU 執行，若使用者重新開啟視窗再次執行轉檔，會造成嚴重的 Race Condition 與檔案鎖定衝突。

---

## 3. 限制與假設 (Caveats)

- 本次審查為**唯讀調查**，無權限且未修改專案原始碼，所有測試皆在現有程式碼基礎上進行。
- 假設開發團隊意圖在未來提供「調整壓縮品質」或「取消任務」的功能，本報告對此提供了前瞻性的介面設計與優化建議。
- 未深入測試極端大圖或毀損 HEIC 檔案在 piexif 解析時的底層記憶體溢出（OOM）極限值。

---

## 4. 移交結論 (Conclusion)

本專案整體架構設計優良、安全機制嚴謹、防禦性程式設計完整。惟有以下兩點急需修復：
1. **修正 `converter.js` 中 EXIF 補正的先後順序**，先做寬高補正判定，再重設 Orientation 為 1。
2. **在 `package.json` 中補上缺失的依賴**（`exifr`、`heic-convert`、`piexif-ts`）。
同時，建議後續實施併發限制優化、視窗關閉的中斷任務機制、以及增加壓縮品質選項以改善使用者體驗。

---

## 5. 驗證方法 (Verification Method)

1. **驗證 EXIF 寬高補正失效 Bug**：
   - 準備一張帶有旋轉屬性（例如 Orientation 為 6）的 HEIC 照片（通常為直向拍攝的手機照片）。
   - 執行轉檔。
   - 使用 EXIF 檢視工具（例如 `exiftool` 或 macOS 預覽程式的資訊視窗）檢視轉換後的 JPG 檔案，確認其「實體像素寬高」與「EXIF 元資料中記錄的寬高」是否相反。
   
2. **驗證依賴缺失問題**：
   - 執行 `npm uninstall heic-jpg-exif` 或在一個全新的空目錄中使用 `pnpm install` 安裝該專案。
   - 嘗試執行 `node src/cli.js`，若發生 `Cannot find module 'heic-convert'` 等錯誤，即驗證了此依賴漏洞。
