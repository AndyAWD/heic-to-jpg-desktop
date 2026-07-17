# HEIC to JPG 無損轉檔工具 (GUI & CLI)

`heic-to-jpg-desktop` 是一個專為 Windows 與 macOS 打造的 HEIC 轉 JPG 工具，支援**高質感視窗介面 (GUI)** 與**高效率命令列介面 (CLI)**。本工具採用純 JavaScript/WASM 技術，完全不需要在您的系統中額外安裝 ImageMagick 或 ExifTool 等第三方圖像軟體。

---

## ✨ 功能特點

- **無損/最高品質轉檔**：轉換時使用最大品質設定（不壓縮），確保所有影像細節完美留存。
- **完整保留 EXIF 資訊**：保留照片原始的拍攝時間、相機型號、相片方向、GPS 位置等元數據 (Metadata)。
- **安全防覆蓋命名**：若目的地已有同名 JPG，或 `heic` 資料夾內已有同名原始檔，程式將自動為新檔案加上序號（例如 `photo_1.jpg`、`photo_1.heic`），以防任何檔案被覆蓋。
- **自動分類搬移**：轉檔完成後，原始的 HEIC 檔案會被自動移入該層目錄新建的 `heic` 資料夾中，而生成的 JPG 檔案則保留在原地，方便整理。
- **支援子資料夾遞迴處理**：可自訂是否要一併掃描並處理所有子目錄下的 HEIC 檔案。

---

## 🛠️ 安裝教學

本工具需要 [Node.js](https://nodejs.org/) 環境。請確保您的電腦上已安裝 Node.js (推薦 LTS 版本，如 v18 或以上)。

1. **複製專案或下載原始碼**：
   ```bash
   git clone https://github.com/andyawd/heic-to-jpg-desktop.git
   cd heic-to-jpg-desktop
   ```

2. **安裝必要依賴套件**：
   在專案目錄下執行以下指令，這將會自動安裝 Electron 與其他轉檔套件：
   ```bash
   npm install
   ```

---

## 🚀 使用說明

本工具提供兩種執行模式：

### 1. 視窗畫面模式 (GUI)
如果您偏好直覺的圖形介面，請執行：
```bash
npm start
```
**操作步驟**：
1. 點擊 **選擇資料夾** 按鈕，彈出系統原生視窗以選擇包含 HEIC 照片的資料夾。
2. （選用）開啟 **遞迴處理子資料夾** 開關，以一併轉換所有子目錄的照片。
3. 點擊 **開始執行轉換**。
4. 介面將即時顯示進度條，並在下方的日誌面板中，以不同顏色印出每個檔案的轉檔狀態與搬移紀錄。

---

### 2. 命令列介面模式 (CLI)
如果您偏好在終端機中執行，或想將轉檔自動化，可以使用 CLI 模式：

#### 互動問答模式
直接執行以下指令，系統會引導您輸入路徑與確認是否遞迴處理：
```bash
npm run cli
```

#### 參數傳入模式
您也可以直接在指令中帶入參數，適合自動化腳本執行：
```bash
# 語法：
# npm run cli -- -p <資料夾路徑> [-r]

# 範例 1：處理特定資料夾（不遞迴處理子目錄）
npm run cli -- -p "/Users/username/Pictures/Photos"

# 範例 2：處理特定資料夾且遞迴處理子目錄
npm run cli -- -p "/Users/username/Pictures/Photos" -r
```

---

## 📂 轉換前後目錄變化範例

**轉換前**：
```
📸 我的照片資料夾/
├── photo1.heic
├── photo2.heic
└── travel.png (非 HEIC，不會被觸動)
```

**轉換後**：
```
📸 我的照片資料夾/
├── photo1.jpg (新生成，保留 EXIF 且不壓縮)
├── photo2.jpg (新生成，保留 EXIF 且不壓縮)
├── travel.png (保持原樣)
└── 📂 heic/
    ├── photo1.heic (由上一層移入)
    └── photo2.heic (由上一層移入)
```

---

## 🛡️ Git 提交偏好說明
本專案開發過程中的所有自動提交均遵循 Gemini CLI 規範：
- 作者 (Author)：`Gemini <218195315+gemini-cli@users.noreply.github.com>`
