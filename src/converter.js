const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');
const { Exifr } = require('exifr');
const heicConvert = require('heic-convert');
const piexif = require('piexif-ts');
const { formatTypes } = require('heic-jpg-exif/dist/format');

/**
 * 安全的 HEIC 轉 JPG 函式，具備 EXIF 遺失防禦性容錯
 */
async function safeConvert(inputPath, outputPath, quality = 1) {
  const fileData = await fs.readFile(inputPath);
  let newJpeg;

  try {
    const exr = new Exifr({
      ifd1: true,
      exif: true,
      gps: true,
      translateKeys: false,
      translateValues: false,
      reviveValues: false,
      sanitize: true,
      mergeOutput: false,
    });

    await exr.read(fileData);
    const parsed = await exr.parse();

    // 如果沒有 EXIF 資訊，直接進行無損轉檔，不注入 EXIF
    if (!parsed || (!parsed.ifd0 && !parsed.exif && !parsed.gps)) {
      const outputBufferArray = await heicConvert({
        buffer: fileData,
        format: 'JPEG',
        quality: quality,
      });
      newJpeg = Buffer.from(outputBufferArray);
    } else {
      // 含有 EXIF，進行過濾、重整與注入
      let { ifd0, ifd1, exif, gps } = parsed;

      const filterTags = (field, tags) => {
        if (!tags) return {};
        const filteredKeys = Object.values(piexif.TagValues[field]).map(String);
        return Object.keys(tags)
          .filter((key) => filteredKeys.includes(key))
          .reduce((obj, key) => {
            obj[key] = tags[key];
            return obj;
          }, {});
      };

      ifd0 = filterTags('ImageIFD', ifd0);
      ifd1 = filterTags('ImageIFD', ifd1);
      exif = filterTags('ExifIFD', exif);
      gps = filterTags('GPSIFD', gps);

      ifd0 = formatTypes('0th', ifd0);
      ifd1 = formatTypes('1st', ifd1);
      exif = formatTypes('Exif', exif);
      gps = formatTypes('GPS', gps);

      ifd0[piexif.TagValues.ImageIFD.Orientation] = 1;
      if (ifd0[piexif.TagValues.ImageIFD.Orientation] > 4) {
        const xd = exif[piexif.TagValues.ExifIFD.PixelXDimension];
        const yd = exif[piexif.TagValues.ExifIFD.PixelYDimension];
        exif[piexif.TagValues.ExifIFD.PixelXDimension] = yd;
        exif[piexif.TagValues.ExifIFD.PixelYDimension] = xd;
      }

      const exifBytes = piexif.dump({
        '0th': ifd0,
        '1st': ifd1,
        Exif: exif,
        GPS: gps,
      });

      const outputBufferArray = await heicConvert({
        buffer: fileData,
        format: 'JPEG',
        quality: quality,
      });

      const outputBuffer = Buffer.from(outputBufferArray);
      const imgData = outputBuffer.toString('binary');
      const newData = piexif.insert(exifBytes, imgData);
      newJpeg = Buffer.from(newData, 'binary');
    }
  } catch (err) {
    // 讀取或注入 EXIF 發生任何例外，則退化為直接無失真轉檔
    try {
      const outputBufferArray = await heicConvert({
        buffer: fileData,
        format: 'JPEG',
        quality: quality,
      });
      newJpeg = Buffer.from(outputBufferArray);
    } catch (convErr) {
      throw convErr;
    }
  }

  if (outputPath) {
    await fs.writeFile(outputPath, newJpeg);
  } else {
    return newJpeg;
  }
}

/**
 * 尋找一個在「原地 JPG」與「heic/ 資料夾中 HEIC」均不衝突的檔名
 */
function getUniqueBaseName(parentDir, baseName) {
  const heicSubDir = path.join(parentDir, 'heic');
  let targetBase = baseName;
  let counter = 1;

  while (true) {
    const jpgPath = path.join(parentDir, `${targetBase}.jpg`);
    const heicPath = path.join(heicSubDir, `${targetBase}.heic`);
    const heifPath = path.join(heicSubDir, `${targetBase}.heif`);

    if (!existsSync(jpgPath) && !existsSync(heicPath) && !existsSync(heifPath)) {
      return targetBase;
    }
    targetBase = `${baseName}_${counter}`;
    counter++;
  }
}

/**
 * 遍歷資料夾中的所有檔案，找出 HEIC/HEIF
 */
async function findHeicFiles(dirPath, recursive, filesList = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === 'heic') continue;
      if (recursive) {
        await findHeicFiles(fullPath, recursive, filesList);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.heic' || ext === '.heif') {
        filesList.push(fullPath);
      }
    }
  }
  return filesList;
}

/**
 * 處理單一 HEIC 檔案的轉檔與搬移
 */
async function convertSingleFile(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const originalBase = path.basename(filePath, ext);

  // 確保同層的 heic 目錄存在
  const heicDir = path.join(dir, 'heic');
  await fs.mkdir(heicDir, { recursive: true });

  // 取得不衝突的主檔名
  const targetBaseName = getUniqueBaseName(dir, originalBase);
  const outputJpgPath = path.join(dir, `${targetBaseName}.jpg`);
  const movedHeicPath = path.join(heicDir, `${targetBaseName}${ext.toLowerCase()}`);

  try {
    // 呼叫我們自己實作的防禦性 safeConvert 轉檔
    await safeConvert(filePath, outputJpgPath, 1);

    // 將原始檔搬移到 heic 子目錄下
    await fs.rename(filePath, movedHeicPath);

    return {
      success: true,
      original: filePath,
      outputJpg: outputJpgPath,
      movedHeic: movedHeicPath
    };
  } catch (err) {
    try {
      if (existsSync(outputJpgPath)) {
        await fs.unlink(outputJpgPath);
      }
    } catch (_) {}
    throw err;
  }
}

/**
 * 執行轉檔流程
 */
async function runConversion(dirPath, recursive, onProgress = () => {}) {
  try {
    onProgress(0, 0, 'scanning', '正在掃描資料夾中的 HEIC 檔案...');
    const files = await findHeicFiles(dirPath, recursive);
    const total = files.length;

    if (total === 0) {
      onProgress(0, 0, 'complete', '未找到任何 HEIC/HEIF 檔案。');
      return { total: 0, processed: 0, results: [] };
    }

    const results = [];
    let processed = 0;

    for (const file of files) {
      const fileName = path.basename(file);
      onProgress(processed, total, 'processing', `正在轉換：${fileName}`);
      
      try {
        const res = await convertSingleFile(file);
        results.push(res);
        processed++;
        onProgress(processed, total, 'progress', fileName);
      } catch (err) {
        results.push({
          success: false,
          original: file,
          error: err.message || err
        });
        processed++;
        onProgress(processed, total, 'error', `${fileName} (${err.message || err})`);
      }
    }

    onProgress(total, total, 'complete', `轉換完成！共處理了 ${total} 個檔案。`);
    return { total, processed, results };
  } catch (err) {
    onProgress(0, 0, 'failed', `發生系統錯誤：${err.message}`);
    throw err;
  }
}

module.exports = {
  runConversion,
  findHeicFiles
};
