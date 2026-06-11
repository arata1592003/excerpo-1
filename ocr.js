// Worker được giữ sống (persistent) suốt phiên — không tạo/xóa mỗi chương
let tessWorker = null;
let tessReady = false;
let tessInitPromise = null;

async function getWorker() {
  // Nếu đang khởi tạo, chờ cho xong (tránh tạo nhiều worker song song)
  if (tessInitPromise) return tessInitPromise;

  if (tessWorker && tessReady) return tessWorker;

  tessInitPromise = (async () => {
    console.log("[Offscreen] Khởi tạo Tesseract lần đầu (sẽ tái dùng cho các lần sau)...");
    tessWorker = await window.Tesseract.createWorker('chi_sim', 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      langPath: chrome.runtime.getURL('tesseract'),
      corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
      workerBlobURL: false,
      gzip: false,
      cacheMethod: 'none',
      // Dùng IndexedDB cache mặc định: lần đầu lưu vào cache, các lần sau đọc tức thì
      logger: m => {
        if (m.progress > 0) console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`);
      }
    });
    tessReady = true;
    tessInitPromise = null;
    console.log("[Offscreen] Tesseract Worker sẵn sàng!");
    return tessWorker;
  })();

  return tessInitPromise;
}

// Khởi động worker ngay khi Offscreen Document được tạo ra (pre-warm)
getWorker().catch(e => console.error("[Offscreen] Pre-warm lỗi:", e));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'run_ocr') {
    (async () => {
      try {
        const worker = await getWorker();
        
        console.log("[Offscreen] Bắt đầu nhận diện...");
        const ret = await worker.recognize(request.dataUrl);
        
        sendResponse({ success: true, text: ret.data.text || "" });
      } catch (err) {
        console.error("[Offscreen LỖI]", err);
        // Reset worker để lần sau thử khởi tạo lại
        tessWorker = null;
        tessReady = false;
        sendResponse({ success: false, error: err.message, stack: err.stack });
      }
    })();
    
    return true; // Báo Chrome rằng sendResponse sẽ được gọi bất đồng bộ
  }
});
