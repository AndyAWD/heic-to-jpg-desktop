# Handoff Report - teamwork_preview_explorer_m1_3

## 1. Observation (觀察)

- **記憶體洩漏與重複分配**
  - 在 `src/converter.js` 第 13 行，使用 `fs.readFile(inputPath)` 讀取整個 HEIC 檔案。
  - 在 `src/converter.js` 第 86-88 行，程式碼先將 JPEG 的 Buffer 轉為二進位字串（Binary String），再將 EXIF 資訊插入字串中，最後再轉回 Buffer：
    ```javascript
    const outputBuffer = Buffer.from(outputBufferArray);
    const imgData = outputBuffer.toString('binary');
    const newData = piexif.insert(exifBytes, imgData);
    newJpeg = Buffer.from(newData, 'binary');
    ```
    在此處，同一個影像檔案在記憶體中至少被複製並以不同型態（Buffer, String）存放了 4-5 次。

- **行程監聽器未清理**
  - 在 `src/renderer.js` 第 87-120 行，全域呼叫了 `window.electronAPI.onConversionProgress(...)`，但並未保存或執行其回傳的 `unsubscribe` 函式：
    ```javascript
    window.electronAPI.onConversionProgress((data) => {
      ...
    });
    ```

- **跨磁碟區搬移限制**
  - 在 `src/converter.js` 第 177 行，程式碼使用 `fs.rename` 將轉檔後的原始 HEIC 檔案移入 `heic` 目錄下：
    ```javascript
    await fs.rename(filePath, movedHeicPath);
    ```
    當 `filePath` 與 `movedHeicPath` 的磁碟路徑若分屬不同掛載點、磁碟分割區或網絡磁碟機時，此處會丟出 `EXDEV` 錯誤。

- **序列化轉檔效率低下**
  - 在 `src/converter.js` 第 212 行，使用 `for (const file of files)` 搭配 `await`，逐一處理轉檔，使多核心 CPU 大部分閒置：
    ```javascript
    for (const file of files) {
      ...
      const res = await convertSingleFile(file);
      ...
    }
    ```

---

## 2. Logic Chain (邏輯鏈)

- **記憶體洩漏推理**：
  1. 每張相片的處理涉及：讀入 HEIC 到 Buffer -> `exifr` 解析 EXIF -> 呼叫 `heicConvert` 轉成 JPEG Buffer -> 轉成二進位字串 -> `piexif` 插入 EXIF -> 轉回二進位字串 -> 轉回 JPEG Buffer。
  2. 此過程在 V8 Heap 中產生多個大容量字串與 Buffer 物件，使得記憶體佔用峰值高達檔案的 4-5 倍。
  3. 因為垃圾回收（GC）具有延遲性，當大批次處理時，大量大物件的瞬間建立會快於垃圾回收的速度，造成記憶體膨脹，引發 Out of Memory (OOM)。
  4. 此外，Renderer 行程在重載時未呼叫 `unsubscribe` 釋放舊的 IPC 監聽器，導致監聽器隨著重新整理而重複累積，形成記憶體洩漏。

- **跨平台相容性推理**：
  1. `fs.rename` 依賴作業系統的硬連結或 inode 重新命名。當檔案系統分割區不同時，作業系統不允許跨裝置的硬連結或 rename，會直接返回 `EXDEV`。
  2. 即使搬移目標是在原始檔案的同層 `heic` 目錄下，若使用者該目錄本身是一個軟連結或獨立掛載的磁碟區，`fs.rename` 就會報錯中斷轉檔，使應用程式不夠健壯。

- **效能瓶頸推理**：
  1. 影像轉檔為 CPU 密集型（CPU-bound）運算。
  2. `for...of` 搭配 `await` 的寫法在單線程 Node.js 中一次只能利用一個 CPU 核心，使得擁有多核心的現代電腦算力大量閒置。
  3. 解決此瓶頸必須引入並行處理（Parallelism），但如果直接用 `Promise.all` 併發，會導致前述記憶體問題呈指數級惡化。因此，必須結合併發限制（Concurrency Limit）來兼顧效能與記憶體安全。

---

## 3. Caveats (注意事項)

- 目前尚未對實際的 OOM 行為進行實測（因不修改專案原始碼，且需要大批次、大容量的 HEIC 檔案）。
- 尚未在真正的 Windows 分割區與 macOS 掛載點上實際模擬 `EXDEV` 錯誤，但該錯誤為 Node.js 檔案操作的已知標準限制。
- 專案相依套件 `inquirer` 在 package.json 中的版本為 `^9.2.12`，在 Node.js 中使用 CommonJS require 載入 ESM 模組的相容性可能取決於 Electron 的 Node.js 執行環境版本，本報告假設目前的執行環境可正確運行。

---

## 4. Conclusion (結論)

專案原始碼在處理大容量圖片與批次轉檔時，存在顯著的效能與穩定性隱患。
1. **主要瓶頸**：串聯式單執行緒處理速度慢；二進位字串與 Buffer 重複轉換耗費極大記憶體；缺乏併發控制。
2. **主要漏洞**：跨磁碟分割區搬移檔案時會引發 `EXDEV` 錯誤中斷；Renderer 行程重新整理時會殘留 IPC 監聽器。
3. **改進方案**：引進併發限制佇列（控制併發數在 4 或 `os.cpus().length - 1`）、在搬移失敗時退化至 `copy + unlink`、使用更高效的 Buffer 拼接來注入 EXIF、在 Renderer 行程重載時呼叫 `unsubscribe`。

---

## 5. Verification Method (驗證方法)

- **驗證記憶體與效能**：
  1. 在資料夾中準備 50 張 15MB 以上的 HEIC 檔案。
  2. 執行 `node src/cli.js -p <資料夾路徑>` 進行轉檔。
  3. 監控 Node.js 的進程，可以使用作業系統活動監視器或 `node --expose-gc` 執行並使用 `process.memoryUsage()` 印出 heap 變化，觀察 Heap Memory 的峰值與轉檔總耗時。

- **驗證 `EXDEV` 跨磁碟區問題**：
  1. 將一 HEIC 檔案置於 USB 隨身碟上（例如在 macOS 上為 `/Volumes/USB/test.heic`）。
  2. 將隨身碟中的 `heic` 目錄預先手動建立，並透過 `ln -s /Users/andyawd/Desktop/heic /Volumes/USB/heic` 軟連結至本機硬碟（即跨分割區）。
  3. 執行 CLI 或 GUI 進行該檔案轉檔，觀察 `fs.rename` 是否拋出 `EXDEV` 錯誤並中斷程式。
