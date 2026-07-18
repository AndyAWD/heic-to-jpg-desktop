// 取得 UI 元素
const btnSelectFolder = document.getElementById('btn-select-folder');
const folderPathInput = document.getElementById('folder-path-input');
const recursiveToggle = document.getElementById('recursive-toggle');
const btnExecute = document.getElementById('btn-execute');

const progressPanel = document.getElementById('progress-panel');
const progressStatusText = document.getElementById('progress-status-text');
const progressPercent = document.getElementById('progress-percent');
const progressBarFill = document.getElementById('progress-bar-fill');
const logWindow = document.getElementById('log-window');

let selectedPath = '';

// 新增日誌至日誌視窗，使用 textContent 與 textNode 防禦 DOM-based XSS 漏洞
function appendLog(message, type = 'info') {
  const logItem = document.createElement('div');
  logItem.className = `log-item log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  
  const timeSpan = document.createElement('span');
  timeSpan.textContent = `[${timestamp}]`;
  logItem.appendChild(timeSpan);
  
  const messageNode = document.createTextNode(` ${message}`);
  logItem.appendChild(messageNode);
  
  logWindow.appendChild(logItem);
  logWindow.scrollTop = logWindow.scrollHeight;
}

// 選擇資料夾按鈕事件
btnSelectFolder.addEventListener('click', async () => {
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      selectedPath = dir;
      folderPathInput.value = dir;
      btnExecute.disabled = false;
      appendLog(`選擇了目標資料夾：${dir}`, 'info');
    }
  } catch (err) {
    appendLog(`選擇資料夾失敗：${err.message}`, 'error');
  }
});

// 開始執行轉檔按鈕事件
btnExecute.addEventListener('click', async () => {
  if (!selectedPath) return;

  // 1. 初始化 UI 狀態
  progressPanel.classList.remove('hidden');
  logWindow.innerHTML = '';
  btnExecute.disabled = true;
  btnSelectFolder.disabled = true;
  recursiveToggle.disabled = true;
  
  progressBarFill.style.width = '0%';
  progressPercent.innerText = '0%';
  progressStatusText.innerText = '正在準備...';

  const recursive = recursiveToggle.checked;
  appendLog(`啟動轉檔任務，目標：${selectedPath} (遞迴：${recursive ? '啟用' : '停用'})`, 'info');

  // 3. 呼叫後端開始執行
  try {
    const result = await window.electronAPI.startConversion({
      dirPath: selectedPath,
      recursive
    });

    if (result.success) {
      const successCount = result.results.filter(r => r.success).length;
      const failCount = result.total - successCount;
      
      appendLog(`🏆 轉檔結束：共處理了 ${result.total} 個檔案。`, 'info');
      appendLog(`🎉 成功轉換並搬移數：${successCount}，失敗數：${failCount}`, successCount === result.total ? 'success' : 'warn');
    } else {
      appendLog(`❌ 轉檔中斷，原因：${result.error}`, 'error');
    }
  } catch (err) {
    appendLog(`❌ 執行時發生未預期錯誤：${err.message}`, 'error');
  } finally {
    // 恢復 UI 操作性
    btnExecute.disabled = false;
    btnSelectFolder.disabled = false;
    recursiveToggle.disabled = false;
  }
});

// 全域註冊進度更新回呼，避免每次點擊重複註冊與 finally 的非同步競爭
const unsubscribe = window.electronAPI.onConversionProgress((data) => {
  const { current, total, status, details } = data;
  
  if (status === 'scanning') {
    progressStatusText.innerText = details;
  } else if (status === 'processing') {
    // current 代表已處理完的個數，因此目前正在處理第 current + 1 個
    progressStatusText.innerText = `正在轉換 [${current + 1}/${total}]...`;
  } else if (status === 'progress') {
    // 成功轉換一個檔案
    appendLog(`✅ 成功轉檔並移動原始檔：${details}`, 'success');
    
    // 更新進度條
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressBarFill.style.width = `${percent}%`;
    progressPercent.innerText = `${percent}%`;
  } else if (status === 'error') {
    // 某個檔案發生錯誤
    appendLog(`❌ 轉檔失敗：${details}`, 'error');
    
    // 錯誤時也要更新進度條，使進度條持續推進
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressBarFill.style.width = `${percent}%`;
    progressPercent.innerText = `${percent}%`;
  } else if (status === 'complete') {
    progressStatusText.innerText = '轉檔完成！';
    progressBarFill.style.width = '100%';
    progressPercent.innerText = '100%';
    appendLog(details, 'success');
  } else if (status === 'failed') {
    progressStatusText.innerText = '執行失敗！';
    appendLog(details, 'error');
  }
});

// 在視窗卸載前，清除 preload 中 onConversionProgress 返回的事件監聽器，防止 Listener 洩漏
window.addEventListener('beforeunload', () => {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }
});

