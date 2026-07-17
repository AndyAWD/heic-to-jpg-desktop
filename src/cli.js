#!/usr/bin/env node

const path = require('path');
const { existsSync } = require('fs');
const { program } = require('commander');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const { runConversion } = require('./converter');

// 設定 CLI 程式資訊與參數
program
  .name('heic-to-jpg-desktop')
  .description('HEIC to JPG 無損轉檔工具 (保留 EXIF 資訊)')
  .version('1.0.0')
  .option('-p, --path <type>', '指定要轉檔的資料夾路徑')
  .option('-r, --recursive', '是否遞迴處理子資料夾', false);

program.parse(process.argv);

const options = program.opts();

async function start() {
  let targetPath = options.path;
  let recursive = options.recursive;

  console.log(chalk.bold.cyan('\n📸 HEIC to JPG 無損轉檔工具 (含 EXIF 保留)'));
  console.log(chalk.cyan('--------------------------------------------------'));

  // 互動模式：若未指定路徑，則詢問使用者
  if (!targetPath) {
    const answers = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'dirPath',
        message: '請輸入或拖曳要轉檔的資料夾路徑：',
        validate: (input) => {
          const trimmed = input.trim().replace(/^['"]|['"]$/g, ''); // 移除拖曳路徑可能帶有的引號
          if (!trimmed) return '資料夾路徑不能為空';
          if (!existsSync(trimmed)) return '找不到該路徑，請確認是否輸入正確';
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'recursive',
        message: '是否要遞迴處理子資料夾內的 HEIC 檔案？',
        default: false
      }
    ]);
    targetPath = answers.dirPath.trim().replace(/^['"]|['"]$/g, '');
    recursive = answers.recursive;
  } else {
    // 檢查參數傳入的路徑
    const resolvedPath = path.resolve(targetPath);
    if (!existsSync(resolvedPath)) {
      console.error(chalk.red(`❌ 錯誤：找不到指定的路徑「${targetPath}」`));
      process.exit(1);
    }
    targetPath = resolvedPath;
  }

  console.log(`\n📂 目標路徑：${chalk.yellow(targetPath)}`);
  console.log(`🔄 遞迴處理：${recursive ? chalk.green('啟用') : chalk.gray('停用')}\n`);

  // 設定 Progress Spinner
  const spinner = ora('正在準備轉檔任務...').start();

  try {
    const result = await runConversion(targetPath, recursive, (current, total, status, details) => {
      if (status === 'scanning') {
        spinner.text = chalk.blue(`🔍 ${details}`);
      } else if (status === 'processing') {
        spinner.text = chalk.yellow(`⏳ [${current}/${total}] ${details}`);
      } else if (status === 'progress') {
        // 完成某一個檔案
        // 我們可以在這裡 log 出來，或是更新 spinner
      } else if (status === 'error') {
        spinner.fail(chalk.red(details));
        // 繼續處理下一個，所以把 spinner 重新啟動
        spinner.start();
      }
    });

    spinner.stop();
    console.log(chalk.cyan('--------------------------------------------------'));
    
    if (result.total === 0) {
      console.log(chalk.yellow('⚠️  未在該資料夾中找到任何 HEIC/HEIF 檔案。'));
    } else {
      console.log(chalk.bold.green(`🎉 轉檔成功！共處理了 ${result.total} 個檔案。`));
      
      const successCount = result.results.filter(r => r.success).length;
      const failCount = result.total - successCount;

      console.log(`✅ 成功：${chalk.green(successCount)}`);
      if (failCount > 0) {
        console.log(`❌ 失敗：${chalk.red(failCount)}`);
      }
      
      console.log(`\n📂 原始檔案已移至該層目錄的 ${chalk.yellow('heic')} 資料夾中。`);
      console.log(`🖼️ 轉換後不壓縮的 JPG 檔案已保留在原地。`);
    }
  } catch (err) {
    spinner.fail(chalk.red('❌ 執行過程中發生嚴重錯誤'));
    console.error(err);
    process.exit(1);
  }
}

start();
