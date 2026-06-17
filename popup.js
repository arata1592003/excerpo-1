/**
 * popup.js - Mạch nha Grabber
 * Refactored to use background script for long-running tasks.
 */

const SOURCES = [Source17k, Source22biqu, SourceUukanshu, SourceJjwxc, SourceQidian, SourceBiquge, Source52shuku, SourceFanqienovel, Source69shuba, SourceNovel543, SourceKakuyomu];
function getSource(url) {
  return SOURCES.find(s => s.pattern.test(url)) || null;
}

// ─── List Engine ──────────────────────────────────────────
async function parseList(html, url, listConfig) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const items = doc.querySelectorAll(listConfig.itemSelector);
  const results = [];

  items.forEach(item => {
    const data = {};
    for (const [field, config] of Object.entries(listConfig.fields)) {
      if (typeof config === "string") {
        data[field] = item.querySelector(config)?.textContent?.trim() || "";
      } else {
        const el = item.querySelector(config.selector);
        data[field] = el ? (el.getAttribute(config.attr) || el.textContent.trim()) : "";
      }
    }
    if (data.url && !data.url.startsWith("http")) {
      const baseUrl = new URL(url).origin;
      data.url = baseUrl + (data.url.startsWith("/") ? "" : "/") + data.url;
    }
    results.push(data);
  });
  return results;
}

// ─── UI Helpers ──────────────────────────────────────────
const dom = {
  urlInput: document.getElementById("urlInput"),
  btnSubmit: document.getElementById("btnSubmit"),
  btnClearState: document.getElementById("btnClearState"),
  result: document.getElementById("result"),
  memeImg: document.getElementById("memeImg")
};

// ─── IndexedDB Helpers for Folder Access ──────────────────
const DB_NAME = "ExcerpoDB";
const STORE_NAME = "ConfigStore";
const KEY_ROOT_HANDLE = "rootFolderHandle";

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setRootHandle(handle) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).put(handle, KEY_ROOT_HANDLE);
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

async function getRootHandle() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).get(KEY_ROOT_HANDLE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

async function verifyPermission(handle) {
  if (!handle) return false;
  try {
    const options = { mode: 'read' };
    const status = await handle.queryPermission(options);
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

async function verifyPermissionManual(handle) {
  if (!handle) return false;
  const options = { mode: 'read' };
  if ((await handle.requestPermission(options)) === 'granted') return true;
  return false;
}

// ─── File Scanning Logic ─────────────────────────────────
async function scanExistingFiles(bookName, chapters, sourceName) {
  const rootHandle = await getRootHandle();
  if (!rootHandle) return null; // Chưa chọn thư mục gốc
  
  if (!(await verifyPermission(rootHandle))) {
    throw new Error("Mất quyền truy cập thư mục gốc. Vui lòng click 'Cấp quyền' ở thanh trạng thái phía trên.");
  }

  try {
    const safeSourceName = (sourceName || "Unknown").replace(/[\\/:*?"<>|]/g, "_");
    const safeBookName = bookName.replace(/[\\/:*?"<>|]/g, "_");
    
    let bookHandle;
    try {
      const sourceHandle = await rootHandle.getDirectoryHandle(safeSourceName);
      bookHandle = await sourceHandle.getDirectoryHandle(safeBookName);
    } catch (e) {
      // Thư mục không tồn tại = Tất cả là chương mới
      return chapters.map(() => ({ status: 'new' }));
    }

    const existingFiles = [];
    for await (const entry of bookHandle.values()) {
      if (entry.kind === 'file') existingFiles.push(entry.name);
    }

    const storage = await chrome.storage.local.get(["cachedFileNameFormat", "cachedFormat"]);
    const nameFormat = storage.cachedFileNameFormat || "#{index}_{title}";
    const format = storage.cachedFormat || "docx";

    return chapters.map((chap, idx) => {
      const stt = chap.chapter_number;
      const safeTitle = chap.chapter_title.replace(/[\\/:*?"<>|]/g, "_");
      
      const expectedName = nameFormat.replace(/\{index\}/g, stt).replace(/\{title\}/g, safeTitle).replace(/[\\/:*?"<>|]/g, "_") + "." + format;
      if (existingFiles.includes(expectedName)) return { status: 'exists' };
      if (existingFiles.includes("ERROR_" + expectedName)) return { status: 'exists' };

      const indexPattern = nameFormat.replace(/\{index\}/g, stt).replace(/\{title\}/g, ".*").replace(/[\\/:*?"<>|]/g, "_");
      const regex = new RegExp("^" + indexPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\.\\\* /g, ".*") + "\\." + format + "$");
      
      const matchedFile = existingFiles.find(f => regex.test(f) || regex.test(f.replace("ERROR_", "")));
      if (matchedFile) return { status: 'updated' };

      return { status: 'new' };
    });
  } catch (err) {
    console.error("Scan error:", err);
    throw err;
  }
}

// ─── Initialization ──────────────────────────────────────
async function init() {
  await restoreState();
  startMonitoringBackground();
  setupEventListeners();
  showRandomMeme();
  updateRootStatus();
}

async function updateRootStatus() {
  const statusDiv = document.getElementById("rootStatus");
  const handle = await getRootHandle();
  if (handle) {
    const hasPermission = await verifyPermission(handle);
    if (hasPermission) {
      statusDiv.innerHTML = `✅ ${handle.name}`;
      statusDiv.style.background = "#e6f4ea";
      statusDiv.style.color = "#0f9d58";
      statusDiv.style.cursor = "default";
      statusDiv.onclick = null;
    } else {
      statusDiv.innerHTML = `🔑 Click cấp quyền: ${handle.name}`;
      statusDiv.style.background = "#fef7e0";
      statusDiv.style.color = "#b06000";
      statusDiv.style.cursor = "pointer";
      statusDiv.onclick = async () => {
        if (await verifyPermissionManual(handle)) {
          updateRootStatus();
          // Re-scan if chapters are present
          const data = await chrome.storage.local.get("lastState");
          if (data.lastState && data.lastState.chapters) {
             const source = getSource(data.lastState.url);
             const chapterDiv = document.getElementById("chapterResult");
             if (source && chapterDiv) {
               await renderChapters(source, data.lastState.chapters, data.lastState.preview.bookName, chapterDiv, null, data.lastState.url);
             }
          }
        }
      };
    }
  } else {
    statusDiv.innerHTML = "❌ Chưa chọn thư mục";
    statusDiv.style.background = "#fce8e6";
    statusDiv.style.color = "#d93025";
    statusDiv.style.cursor = "default";
    statusDiv.onclick = null;
  }
}

// ─── Background Sync ─────────────────────────────────────

function startMonitoringBackground() {
  // Listen for progress updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TASK_PROGRESS') {
      renderBackgroundProgress(message.data);
    }
  });

  // Check if there's already a task running
  chrome.runtime.sendMessage({ type: 'GET_TASK_STATUS' }, (task) => {
    if (task && task.status === 'running') {
      renderBackgroundProgress(task);
    }
  });
}

function renderBackgroundProgress(task) {
  const queueList = document.getElementById("queueList");
  const btnStop = document.getElementById("btnStopDownload");
  if (!queueList) return;

  if (task.status === 'running' || task.status === 'stopping') {
    btnStop.style.display = "block";
    btnStop.textContent = task.status === 'stopping' ? "⏳ Đang dừng lại..." : "⏹ Dừng tải ngầm toàn bộ";
    btnStop.disabled = task.status === 'stopping';

    const btnAll = document.getElementById("btnDownloadAll");
    if (btnAll) {
      btnAll.textContent = task.status === 'stopping' ? "⏳ Đang dừng công việc..." : "➕ Thêm các chương đã chọn vào hàng đợi";
      btnAll.disabled = task.status === 'stopping';
    }

    // Render Queue Items
    if (!task.queue || task.queue.length === 0) {
      queueList.innerHTML = `<div style="text-align:center;color:#999;font-size:11px;margin-top:20px;">Đang khởi tạo hàng đợi...</div>`;
    } else {
      queueList.innerHTML = task.queue.map((q, idx) => {
        const pct = Math.round((q.done / Math.max(1, q.total)) * 100);
        let statusStr = "";
        let color = "#333";
        if (q.status === 'running') {
          statusStr = "Đang tải...";
          color = "#1a73e8";
        } else if (q.status === 'pending') {
          statusStr = "Chờ tải";
          color = "#f4b400";
        } else if (q.status === 'completed') {
          statusStr = "Hoàn tất";
          color = "#0f9d58";
        } else if (q.status === 'cancelled') {
          statusStr = "Đã hủy";
          color = "#ea4335";
        }

        return `
          <div class="queue-item" style="display:flex;align-items:center;gap:6px;">
            <div style="font-size:11px;font-weight:bold;color:#aaa;min-width:18px;text-align:center;">#${idx + 1}</div>
            <div class="queue-item-info" style="flex:1;min-width:0;">
              <div class="queue-item-title" title="${q.bookName}">${q.bookName}</div>
              <div class="queue-item-status">
                <span style="color:${color};font-weight:bold;">${statusStr}</span> • ${q.done}/${q.total} chương
              </div>
              <div style="height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;margin-top:4px;">
                <div style="height:100%;width:${pct}%;background:${color};transition:width 0.3s;border-radius:2px;"></div>
              </div>
            </div>
            ${(q.status === 'running' || q.status === 'pending') ? `
              <button class="btn-cancel-book" data-url="${q.bookUrl}">X</button>
            ` : ''}
          </div>
        `;
      }).join("");

      // Add cancel event listeners
      document.querySelectorAll(".btn-cancel-book").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.disabled = true;
          chrome.runtime.sendMessage({ type: 'CANCEL_BOOK', bookUrl: btn.dataset.url });
        });
      });
    }
  } else if (task.status === 'completed' || task.status === 'stopped' || task.status === 'error') {
    btnStop.style.display = "none";
    const btnAll = document.getElementById("btnDownloadAll");
    if (btnAll) {
      btnAll.disabled = false;
      btnAll.textContent = `⬇ Tải lại các chương đã chọn`;
    }
    queueList.innerHTML = `<div style="text-align:center;color:#999;font-size:11px;margin-top:20px;">Hàng đợi trống</div>`;
  }
}

// Re-implement renderProgressBar locally since utils.js is not an ESM (or we can import it if we make it one)
// But for small things, duplication is fine or we use classic script tags.
function renderProgressBar(pct) {
  return `
    <div style="height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;margin-top:4px;">
      <div style="height:100%;width:${pct}%;background:#1a73e8;transition:width 0.3s;border-radius:3px;"></div>
    </div>`;
}

// ─── Rendering Logic ──────────────────────────────────────
function renderPreview(d, source, url, tabId, resultDiv) {
  resultDiv.innerHTML = `
    <div style="display:flex;gap:12px;margin-top:8px;">
      ${d.coverImage
      ? `<img src="${d.coverImage}" style="width:80px;height:110px;object-fit:cover;border-radius:4px;flex-shrink:0;">`
      : `<div style="width:80px;height:110px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#999;">No cover</div>`
    }
      <div style="flex:1;min-width:0;">
        <b style="font-size:14px;">${d.bookName || "Không rõ tên"}</b><br>
        <span style="color:#666;font-size:12px;">✍️ ${d.authorName || "Không rõ tác giả"}</span><br>
        <span style="color:#999;font-size:11px;">ID: ${d.sourceBookCode || "?"}</span><br>
        ${d.description ? `<p style="font-size:12px;margin-top:6px;color:#444;">${d.description}...</p>` : ""}
        <a href="${d.url}" target="_blank" style="font-size:11px;">🔗 Xem trang gốc</a>
      </div>
    </div>

    <div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px;">
      <button id="btnChapters" style="padding:6px 12px;background:#1a73e8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
        📋 Lấy danh sách chapter
      </button>
      <div id="chapterResult" style="margin-top:8px;"></div>
    </div>
  `;

  document.getElementById("btnChapters").addEventListener("click", async () => {
    const chapterDiv = document.getElementById("chapterResult");
    chapterDiv.innerHTML = `<p style="font-size:12px;color:#666;">⏳ Đang lấy danh sách chapter...</p>`;

    try {
      let chapters = [];
      if (source.fetchChapters) {
        chapters = await source.fetchChapters(url, (msg) => {
          const count = chapters.length;
          chapterDiv.innerHTML = `
            <p style="font-size:12px;color:#666;">⏳ ${msg}</p>
            <p style="font-size:11px;color:#1a73e8;margin-top:2px;">Tìm thấy: <b>${count}</b> chapters...</p>
          `;
        });
      } else {
        let currentTabId = tabId;
        if (!currentTabId) {
          const tab = await chrome.tabs.create({ url, active: false });
          currentTabId = tab.id;
        }
        chapters = await fetchChaptersFromTab(currentTabId, source);
      }

      if (!chapters.length) {
        chapterDiv.innerHTML = `<p style="color:red;font-size:12px;">❌ Không tìm thấy chapter nào</p>`;
        return;
      }

      await chrome.storage.local.set({ lastState: { url, preview: d, chapters, timestamp: Date.now() } });
      await renderChapters(source, chapters, d.bookName, chapterDiv, tabId, url);
    } catch (err) {
      chapterDiv.innerHTML = `<p style="color:red;font-size:12px;">❌ Lỗi: ${err.message}</p>`;
    }
  });
}

async function renderChapters(source, chapters, bookName, chapterDiv, tabId, url) {
  const storage = await chrome.storage.local.get(["cachedFolder", "cachedFormat", "cachedConflictAction", "cachedSelectedChapters", "lastState"]);
  
  // Chỉ sử dụng cachedSelectedChapters nếu nó thuộc về cùng một URL truyện đang xem
  const isSameBook = storage.lastState && storage.lastState.url === url;
  const cachedSelectedChapters = isSameBook ? storage.cachedSelectedChapters : undefined;

  // Scan local files
  const scanResults = await scanExistingFiles(bookName, chapters, source.name);

  chapterDiv.innerHTML = `
    <div style="margin:6px 0;background:#f5f5f5;padding:6px;border-radius:4px;border:1px solid #eee;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <p style="font-size:12px;color:#333;margin:0;"><b>${chapters.length} chapters</b></p>
        <div>
          <button id="btnSelectAll" style="padding:2px 6px;font-size:10px;background:#e0e0e0;border:1px solid #ccc;border-radius:3px;cursor:pointer;color:#333;">Chọn tất cả</button>
          <button id="btnDeselectAll" style="padding:2px 6px;font-size:10px;background:#e0e0e0;border:1px solid #ccc;border-radius:3px;cursor:pointer;color:#333;">Bỏ chọn tất cả</button>
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <label style="font-size:10px;color:#666;white-space:nowrap;">Chọn nhanh:</label>
        <input type="text" id="quickSelectInput" style="flex:1;padding:4px;font-size:11px;border:1px solid #ccc;border-radius:3px;" placeholder="vd: 1, 2, 5-10">
        <button id="btnQuickSelect" style="padding:4px 8px;background:#1a73e8;color:white;border:none;border-radius:3px;cursor:pointer;font-size:10px;">Chọn</button>
      </div>
    </div>
    <div style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:4px;margin-top:6px;">
      ${chapters.map((c, idx) => {
    const isVip = c.type === "vip";
    const icon = isVip ? "🔒" : c.type === "unvip" ? "🔓" : "";

    // Status from scan
    const status = scanResults ? scanResults[idx].status : 'new';
    let statusLabel = "";

    // Logic chọn chương: 
    // 1. Luôn bỏ chọn nếu Đã có file (status === 'exists')
    // 2. Nếu không, lấy từ cache nếu là cùng một bộ truyện
    // 3. Nếu là bộ mới hoàn toàn, mặc định chọn tất cả
    let isChecked = true;
    if (status === 'exists') {
        isChecked = false;
    } else if (cachedSelectedChapters !== undefined) {
        isChecked = cachedSelectedChapters.includes(idx);
    }

    let rowStyle = "";
    if (status === 'exists') {
        statusLabel = `<span style="color:#0f9d58;font-size:9px;margin-left:4px;">(Đã có file)</span>`;
        rowStyle = "opacity: 0.7; background: #f9f9f9;";
    } else if (status === 'updated') {
        statusLabel = `<span style="color:#ea4335;font-size:9px;margin-left:4px;font-weight:bold;">(Web cập nhật tiêu đề)</span>`;
        rowStyle = "background: #fff8f8;";
        isChecked = true; 
    }

    return `
          <div style="font-size:11px;padding:4px 8px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:6px;${rowStyle}">
            <input type="checkbox" class="chap-checkbox" data-idx="${idx}" ${isChecked ? 'checked' : ''}>
            <span style="color:#999;min-width:30px;">#${c.chapter_number}</span>
            <a href="${c.chapter_url}" target="_blank" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1a73e8;">
              ${c.chapter_title}
            </a>
            ${statusLabel}
            <span style="width:20px;text-align:center;flex-shrink:0;">${icon}</span>
          </div>
        `;
  }).join('')}
    </div>
    <div style="margin-top:10px;background:#f5f5f5;padding:8px;border-radius:4px;border:1px solid #ddd;">
      <button id="btnDownloadAll" style="width:100%;padding:8px;background:#0f9d58;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">
        ⬇ Tải các chương đã chọn (Chạy ngầm)
      </button>
      <div id="downloadProgress" style="margin-top:6px;font-size:11px;color:#666;min-height:16px;">
        Cấu hình định dạng tải trong mục Cài đặt (⚙️).
      </div>
    </div>
  `;

  // Lưu lại danh sách đã chọn ngay sau khi render lần đầu (để cập nhật cache chính xác)
  const saveSelected = () => {
    const selected = Array.from(document.querySelectorAll(".chap-checkbox:checked")).map(cb => parseInt(cb.dataset.idx));
    chrome.storage.local.set({ cachedSelectedChapters: selected });
  };
  saveSelected();


  chapterDiv.addEventListener('change', (e) => {
    if (e.target.classList.contains('chap-checkbox')) saveSelected();
  });

  document.getElementById("btnSelectAll").addEventListener("click", () => {
    document.querySelectorAll(".chap-checkbox").forEach(cb => cb.checked = true);
    saveSelected();
  });
  document.getElementById("btnDeselectAll").addEventListener("click", () => {
    document.querySelectorAll(".chap-checkbox").forEach(cb => cb.checked = false);
    saveSelected();
  });

  document.getElementById("btnQuickSelect").addEventListener("click", () => {
    const val = document.getElementById("quickSelectInput").value;
    const parts = val.replace(/#/g, '').split(/[, ]+/);
    // Uncheck all first
    document.querySelectorAll(".chap-checkbox").forEach(cb => cb.checked = false);
    parts.forEach(p => {
      p = p.trim();
      if (!p) return;
      if (p.includes('-')) {
        const [start, end] = p.split('-').map(Number);
        if (start && end) {
          for (let i = start; i <= end; i++) {
            const cb = document.querySelector(`.chap-checkbox[data-idx="${i - 1}"]`);
            if (cb) cb.checked = true;
          }
        }
      } else {
        const num = Number(p);
        if (num) {
          const cb = document.querySelector(`.chap-checkbox[data-idx="${num - 1}"]`);
          if (cb) cb.checked = true;
        }
      }
    });
    saveSelected();
  });

  // Download all button sends message to background
  document.getElementById("btnDownloadAll").addEventListener("click", async () => {
    const btnAll = document.getElementById("btnDownloadAll");
    const checkboxes = document.querySelectorAll(".chap-checkbox:checked");
    const filteredChapters = Array.from(checkboxes).map(cb => chapters[parseInt(cb.dataset.idx)]);

    if (filteredChapters.length === 0) {
      alert("⚠️ Không có chương nào được chọn!");
      return;
    }

    const storage = await chrome.storage.local.get(["cachedFolder", "cachedFormat", "cachedConflictAction", "cachedFileNameFormat"]);
    const format = storage.cachedFormat || "docx";
    const folderName = storage.cachedFolder || "Excerpo";
    const conflictAction = storage.cachedConflictAction || "uniquify";
    const nameFormat = storage.cachedFileNameFormat || "#{index}_{title}";

    btnAll.disabled = true;
    btnAll.textContent = `⏳ Đang gửi ${filteredChapters.length} chương...`;

    // Attach per-chapter metadata
    const enrichedChapters = filteredChapters.map(c => ({
      ...c,
      bookName,
      sourceName: source.name,
      bookUrl: url,
      folderName,
      format,
      conflictAction,
      nameFormat,
      // Metadata for book info & cover
      bookDescription: storage.lastState?.preview?.description || "",
      bookAuthor: storage.lastState?.preview?.authorName || "",
      bookCover: storage.lastState?.preview?.coverImage || ""
    }));

    chrome.runtime.sendMessage({
      type: 'ADD_TO_BATCH_DOWNLOAD',
      data: { chapters: enrichedChapters }
    }, (response) => {
      if (!response) {
        btnAll.disabled = false;
        btnAll.textContent = "❌ Lỗi kết nối nền";
      } else {
        btnAll.textContent = "🚀 Đã gửi! Đang tải nền...";

        if (typeof window.switchTab === "function") {
          window.switchTab("queue");
        }

        // Re-enable button after 2 seconds so user can crawl another book and queue it
        setTimeout(() => {
          btnAll.disabled = false;
          btnAll.textContent = "⬇ Tải các chương đã chọn (Chạy ngầm)";
        }, 2000);
      }
    });
  });

  // Removed individual download buttons logic
}

// ─── Fetching Logic ───────────────────────────────────────
async function fetchChaptersFromTab(tabId, source) {
  const selector = source.chapterListSelector || "#chaptercontainerinner a.listchapitem";
  let found = false;
  for (let i = 0; i < 20; i++) {
    const [{ result: count }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [selector],
      func: (sel) => document.querySelectorAll(sel).length
    });
    if (count > 0) { found = true; break; }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!found) throw new Error("Timeout: danh sách chapter chưa render");

  const [{ result: chapters }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [selector, source.name],
    func: (sel, sourceName) => {
      const elements = [...document.querySelectorAll(sel)];
      return elements.map((el, i) => {
        let url = el.href;
        if (sourceName === 'sangtacviet') {
           const parent = el.parentElement;
           const urlKey = Object.keys(parent).find(k => !k.startsWith("__") && !k.startsWith("jQuery"));
           const path = urlKey ? parent[urlKey] : null;
           url = path ? `https://sangtacviet.com${path}` : null;
        }
        return {
          chapter_number: i + 1,
          chapter_title: el.textContent?.trim() || el.getAttribute("title")?.trim() || `Chương ${i + 1}`,
          chapter_url: url,
          type: el.classList.contains("vip") ? "vip" : el.classList.contains("unvip") ? "unvip" : "normal",
        };
      }).filter(c => c.chapter_url);
    }
  });

  return chapters;
}

async function fetchIndividualChapter(source, chapter) {
  const tab = await chrome.tabs.create({ url: chapter.chapter_url, active: false });
  await new Promise(r => {
    function listener(tid, info) { if (tid === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); r(); } }
    chrome.tabs.onUpdated.addListener(listener);
  });

  // Chờ cho đến khi nội dung render xong (giống background.js)
  for (let i = 0; i < 30; i++) {
    const [{ result: ok }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [source.name, source.chapterContentSelector],
      func: (sourceName, contentSelector) => {
        const contentEl = document.querySelector(contentSelector || "div[id^='cld-']");
        return !!contentEl;
      }
    });

    if (ok) {
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [chapter.chapter_url, null, chapter.chapter_number, chapter.chapter_title, source.name, source.chapterTitleSelector, source.chapterContentSelector],
      func: (url, alertMsg, num, title, sourceName, titleSelector, contentSelector) => {
        if (alertMsg) return { chapter_title: title, chapter_url: url, content: "LỖI:\n" + alertMsg };
        let chapterTitle = title;
        let paragraphs = [];

        const titleEl = document.querySelector(titleSelector || "h1, h2");
        const container = document.querySelector(contentSelector || "div[id^='cld-']");

        if (container) {
          chapterTitle = title;
          const clone = container.cloneNode(true);
          clone.querySelectorAll([
            "script", "style", "iframe", "i[t]",
            ".has-text-centered", ".chapter-control", ".is-size-2", ".mt-4", ".mb-4",
            ".copy", ".author-say", ".qrcode", ".chapter_text_ad",
            "#banner_content",
          ].join(", ")).forEach(el => el.remove());
          
          const pTags = clone.querySelectorAll("p");
          if (pTags.length > 0) {
            paragraphs = Array.from(pTags).map(p => p.textContent.trim()).filter(s => s.length > 0);
          } else {
            clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
            paragraphs = clone.textContent.split("\n").map(s => s.trim()).filter(s => s.length > 0);
          }
        } else {
           return { chapter_title: title, chapter_url: url, content: "Lỗi tải nội dung" };
        }

        return { chapter_title: chapterTitle, content: paragraphs.join("\n\n"), chapter_url: url, chapter_number: num };
      }
    });
    return result;
  } finally {
    chrome.tabs.remove(tab.id);
  }
}

async function downloadChapterAsDocx(chapter) {
  // Relying on global docx from popup.html
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
  const paragraphs = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(chapter.chapter_title)] }),
    ...(chapter.content || "").split("\n\n").map(text => new Paragraph({ children: [new TextRun({ text, size: 24 })] }))
  ];
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const isContentError = !chapter.content ||
    chapter.content.includes("NỘI DUNG CHƯA TẢI ĐƯỢC") ||
    chapter.content.includes("Hệ thống không tìm thấy nội dung") ||
    chapter.content.includes("Lỗi tải nội dung") ||
    chapter.content.includes("Lỗi:") ||
    chapter.content.length < 100;
  const prefix = isContentError ? "ERROR_" : "";

  // const stt = chapter.chapter_number;
  // a.download = `${prefix}STT${stt}_${chapter.chapter_title.replace(/[\\/:*?"<>|]/g, "_")}.docx`;
  const sttFormatted = String(chapter.chapter_number).padStart(5, '0');
  a.download = `${prefix}chuong-${sttFormatted}_${chapter.chapter_title.replace(/[\\/:*?"<>|]/g, "_")}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── State Management ─────────────────────────────────────
async function restoreState() {
  const data = await chrome.storage.local.get("lastState");
  if (!data.lastState) return;

  const { url, preview, chapters } = data.lastState;
  const source = getSource(url);
  if (!source) return;

  dom.urlInput.value = url;
  renderPreview(preview, source, url, null, dom.result);

  if (chapters && chapters.length) {
    await renderChapters(source, chapters, preview.bookName, document.getElementById("chapterResult"), null, url);
  }
}

// ─── Events ──────────────────────────────────────────────
function setupEventListeners() {
  dom.btnClearState.addEventListener("click", async () => {
    await chrome.storage.local.remove("lastState");
    dom.urlInput.value = "";
    dom.result.innerHTML = "";
  });

  dom.btnSubmit.addEventListener("click", async () => {
    const url = dom.urlInput.value.trim();
    if (!url) return;

    const source = getSource(url);
    if (!source) { alert("URL không hợp lệ"); return; }

    dom.result.innerHTML = `<p>⏳ Đang mở trang...</p>`;
    const tab = await chrome.tabs.create({ url, active: false });

    // Polling for DOM readiness instead of waiting for complete load
    let d = null;
    let html = "";
    for (let i = 0; i < 20; i++) {
      try {
        const [{ result: currentHtml }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: () => document.documentElement ? document.documentElement.outerHTML : "",
        });
        if (currentHtml) {
          html = currentHtml;
          const parsed = source.parsePreview(currentHtml, url);
          if (parsed && parsed.bookName) {
            d = parsed;
            break;
          }
        }
      } catch (err) {
        // Ignore errors during navigation or before document exists
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!d) {
      d = source.parsePreview(html, url);
    }

    // Chuyển ảnh thành base64 trong tab gốc để tránh bị chặn hiển thị (chống hotlink)
    if (d.coverImage && d.coverImage.startsWith("http")) {
      try {
        const [{ result: base64Img }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          args: [d.coverImage],
          func: async (imgUrl) => {
            try {
              const res = await fetch(imgUrl);
              const blob = await res.blob();
              return await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            } catch (e) { return null; }
          }
        });
        if (base64Img) d.coverImage = base64Img;
      } catch (err) {
        console.warn("Lỗi tải ảnh blob:", err);
      }
    }

    await chrome.storage.local.set({ lastState: { url, preview: d, chapters: null, timestamp: Date.now() } });
    renderPreview(d, source, url, tab.id, dom.result);
  });

  document.querySelectorAll(".example-url").forEach(el => {
    el.addEventListener("click", () => {
      dom.urlInput.value = el.dataset.url;
      dom.urlInput.focus();
    });
  });

  // Load initial settings
  chrome.storage.local.get(["cachedFolder", "cachedFormat", "cachedConflictAction", "chapterDelay", "cachedFileNameFormat"], (s) => {
    document.getElementById("settingFolder").value = s.cachedFolder || "Excerpo";
    document.getElementById("settingFormat").value = s.cachedFormat || "docx";
    document.getElementById("settingConflict").value = s.cachedConflictAction || "uniquify";
    document.getElementById("settingDelay").value = (s.chapterDelay !== undefined) ? s.chapterDelay : 60;
    document.getElementById("settingFileNameFormat").value = s.cachedFileNameFormat || "#{index}_{title}";
  });

  // Auto-save settings on change
  const saveSettings = () => {
    const folder = document.getElementById("settingFolder").value.trim() || "Excerpo";
    const format = document.getElementById("settingFormat").value;
    const conflict = document.getElementById("settingConflict").value;
    const nameFormat = document.getElementById("settingFileNameFormat").value.trim() || "#{index}_{title}";
    let delay = parseInt(document.getElementById("settingDelay").value);
    if (isNaN(delay) || delay < 0) delay = 60;

    chrome.storage.local.set({
      cachedFolder: folder,
      cachedFormat: format,
      cachedConflictAction: conflict,
      chapterDelay: delay,
      cachedFileNameFormat: nameFormat
    });
  };

  document.getElementById("settingFolder").addEventListener("input", saveSettings);
  document.getElementById("settingFormat").addEventListener("change", saveSettings);
  document.getElementById("settingConflict").addEventListener("change", saveSettings);
  document.getElementById("settingDelay").addEventListener("input", saveSettings);
  document.getElementById("settingFileNameFormat").addEventListener("input", saveSettings);

  // Main tab switcher
  const tabs = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".tab-panel");

  window.switchTab = (targetTab) => {
    tabs.forEach(t => {
      if (t.dataset.tab === targetTab) {
        t.classList.add("active");
      } else {
        t.classList.remove("active");
      }
    });

    panels.forEach(p => {
      if (p.id === `panel-${targetTab}`) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });

    if (targetTab === "queue") {
      chrome.runtime.sendMessage({ type: 'GET_TASK_STATUS' }, (task) => {
        if (task) {
          renderBackgroundProgress(task);
        }
      });
    }
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      window.switchTab(tab.dataset.tab);
    });
  });

  // Root Folder Selection
  const btnSelectRoot = document.getElementById("btnSelectRoot");
  if (btnSelectRoot) {
    btnSelectRoot.addEventListener("click", async () => {
      try {
        const handle = await window.showDirectoryPicker();
        await setRootHandle(handle);
        updateRootStatus();
        
        // If we have chapters currently rendered, re-scan and re-render them
        const data = await chrome.storage.local.get("lastState");
        if (data.lastState && data.lastState.chapters) {
          const source = getSource(data.lastState.url);
          const chapterDiv = document.getElementById("chapterResult");
          if (source && chapterDiv) {
            await renderChapters(source, data.lastState.chapters, data.lastState.preview.bookName, chapterDiv, null, data.lastState.url);
          }
        }
      } catch (err) {
        console.error("Picker error:", err);
      }
    });
  }

  // Bulk Crawl logic
  const bulkUrlInput = document.getElementById("bulkUrlInput");
  const btnStartBulk = document.getElementById("btnStartBulk");
  const bulkLog = document.getElementById("bulkLog");
  const btnClearBulkLog = document.getElementById("btnClearBulkLog");
  
  const addLog = async (msg, color = "#0f0") => {
    const logEntry = { time: new Date().toLocaleTimeString(), msg, color };
    
    // UI Update
    const div = document.createElement("div");
    div.style.color = color;
    div.textContent = `[${logEntry.time}] ${msg}`;
    bulkLog.appendChild(div);
    bulkLog.scrollTop = bulkLog.scrollHeight;
    bulkLog.style.display = "block";

    // Persistence
    const data = await chrome.storage.local.get("bulkLogs");
    const logs = data.bulkLogs || [];
    logs.push(logEntry);
    // Giới hạn 200 dòng log để tránh tràn bộ nhớ
    if (logs.length > 200) logs.shift(); 
    await chrome.storage.local.set({ bulkLogs: logs });
  };

  // Restore logs on startup
  const restoreLogs = async () => {
    const data = await chrome.storage.local.get("bulkLogs");
    if (data.bulkLogs && data.bulkLogs.length > 0) {
      bulkLog.style.display = "block";
      data.bulkLogs.forEach(log => {
        const div = document.createElement("div");
        div.style.color = log.color;
        div.textContent = `[${log.time}] ${log.msg}`;
        bulkLog.appendChild(div);
      });
      bulkLog.scrollTop = bulkLog.scrollHeight;
    }
  };
  restoreLogs();

  if (btnClearBulkLog) {
    btnClearBulkLog.addEventListener("click", async () => {
      if (confirm("Bạn có chắc muốn xóa toàn bộ nhật ký cào nâng cao?")) {
        await chrome.storage.local.remove("bulkLogs");
        bulkLog.innerHTML = "<div>[System] Nhật ký đã được dọn dẹp.</div>";
      }
    });
  }

  btnStartBulk.addEventListener("click", async () => {
    const baseUrl = bulkUrlInput.value.trim();
    if (!baseUrl) {
      alert("Vui lòng nhập URL danh sách truyện!");
      return;
    }

    const startPage = parseInt(document.getElementById("bulkStartPage").value) || 1;
    const pageCount = parseInt(document.getElementById("bulkPageCount").value) || 1;
    const direction = document.getElementById("bulkDirection").value;
    
    const source = getSource(baseUrl);
    if (!source || source.name !== "novel543") {
      alert("Chế độ nâng cao hiện chỉ hỗ trợ novel543 (hoặc URL chưa đúng)");
      return;
    }

    btnStartBulk.disabled = true;
    bulkLog.style.display = "block";
    addLog("Bắt đầu quy trình cào nâng cao...");

    try {
      for (let i = 0; i < pageCount; i++) {
        const currentPage = direction === "forward" ? startPage + i : startPage - i;
        if (currentPage < 1) break;

        // Xây dựng URL trang thông minh hơn (hỗ trợ end=2 và các tham số khác)
        let pageUrl = baseUrl;
        if (baseUrl.includes("?")) {
            // Nếu đã có tham số, nối thêm &page=X (trình duyệt sẽ ưu tiên cái sau nếu trùng, hoặc ta có thể replace)
            const urlObj = new URL(baseUrl);
            urlObj.searchParams.set("page", currentPage);
            pageUrl = urlObj.toString();
        } else {
            pageUrl = `${baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"}?page=${currentPage}`;
        }

        addLog(`Đang quét trang ${currentPage}...`, "#1a73e8");
        addLog(`URL: ${pageUrl}`, "#999");
        
        const tab = await chrome.tabs.create({ url: pageUrl, active: false });
        let html = "";
        for (let j = 0; j < 10; j++) {
           const [{result}] = await chrome.scripting.executeScript({
             target: {tabId: tab.id},
             func: () => document.documentElement.outerHTML
           });
           html = result;
           if (html.includes("media-content")) break;
           await new Promise(r => setTimeout(r, 1000));
        }
        chrome.tabs.remove(tab.id);

        const books = await parseList(html, pageUrl, source.list);
        addLog(`Tìm thấy ${books.length} truyện tại trang ${currentPage}`);

        for (const book of books) {
          // Kiểm tra lại quyền truy cập thực tế trước mỗi bộ truyện
          const currentHandle = await getRootHandle();
          const hasPermission = await verifyPermission(currentHandle);
          if (!hasPermission) {
            addLog(`⚠️ Cần xác nhận lại quyền để tiếp tục xử lý: ${book.bookName}`, "#f4b400");
            addLog(`Vui lòng click vào thanh trạng thái File System phía trên, sau đó nhấn "Bắt đầu" để tiếp tục.`, "#f4b400");
            updateRootStatus();
            btnStartBulk.disabled = false;
            return; // Dừng an toàn để người dùng tương tác
          }

          addLog(`Đang xử lý truyện: ${book.bookName}...`);
          
          // Fetch chapters for this book
          const chapters = await source.fetchChapters(book.url, (m) => {});
          if (!chapters || chapters.length === 0) {
            addLog(`Không tìm thấy chương cho ${book.bookName}, bỏ qua.`, "#ea4335");
            continue;
          }

          // TRÍCH XUẤT THÊM THÔNG TIN TRUYỆN CHO BULK
          const tabBookInfo = await chrome.tabs.create({ url: book.url, active: false });
          let bookMetadata = { description: "", author: "", cover: "" };
          for (let k = 0; k < 10; k++) {
             const [{result: parsedPreview}] = await chrome.scripting.executeScript({
               target: {tabId: tabBookInfo.id},
               func: () => document.documentElement.outerHTML
             });
             const d = source.parsePreview(parsedPreview, book.url);
             if (d && d.bookName) {
                bookMetadata.description = d.description || "";
                bookMetadata.author = d.authorName || "";
                bookMetadata.cover = d.coverImage || "";
                break;
             }
             await new Promise(r => setTimeout(r, 1000));
          }
          chrome.tabs.remove(tabBookInfo.id);

          // Scan local files
          const scanResults = await scanExistingFiles(book.bookName, chapters, source.name);
          const toDownload = [];
          
          chapters.forEach((chap, idx) => {
            const status = scanResults ? scanResults[idx].status : "new";
            if (status === "new" || status === "updated") {
              toDownload.push(chap);
            }
          });

          if (toDownload.length > 0) {
            addLog(`Thêm ${toDownload.length} chương mới của "${book.bookName}" vào hàng đợi.`);
            
            const storage = await chrome.storage.local.get(["cachedFolder", "cachedFormat", "cachedConflictAction", "cachedFileNameFormat"]);
            const enriched = toDownload.map(c => ({
              ...c,
              bookName: book.bookName,
              sourceName: source.name,
              bookUrl: book.url,
              folderName: storage.cachedFolder || "Excerpo",
              format: storage.cachedFormat || "docx",
              conflictAction: storage.cachedConflictAction || "uniquify",
              nameFormat: storage.cachedFileNameFormat || "#{index}_{title}",
              // Metadata from bulk scan
              bookDescription: bookMetadata.description,
              bookAuthor: bookMetadata.author,
              bookCover: bookMetadata.cover
            }));

            await new Promise(resolve => {
              chrome.runtime.sendMessage({
                type: 'ADD_TO_BATCH_DOWNLOAD',
                data: { chapters: enriched }
              }, resolve);
            });
          } else {
            addLog(`Truyện "${book.bookName}" đã đủ file, bỏ qua.`);
          }
          
          // Small delay between books to avoid rate limit
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      addLog("HOÀN TẤT QUY TRÌNH QUÉT NÂNG CAO!", "#0f9d58");
    } catch (err) {
      addLog(`LỖI: ${err.message}`, "#ea4335");
      console.error(err);
    } finally {
      btnStartBulk.disabled = false;
    }
  });

  // Global stop button
  const btnStop = document.getElementById("btnStopDownload");
  if (btnStop) {
    btnStop.addEventListener("click", () => {
      btnStop.disabled = true;
      btnStop.textContent = "⏳ Đang dừng lại...";
      chrome.runtime.sendMessage({ type: 'STOP_BATCH_DOWNLOAD' });
    });
  }

}

function showRandomMeme() {
  // Logic remains the same
}

init();