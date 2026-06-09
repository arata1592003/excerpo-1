const SourceFanqienovel = {
    name: "fanqienovel",
    maxWorkers: 1, // Avoid running multiple OCR instances at once which would crash the browser
    downloadDelay: 2000,
    pattern: /fanqienovel\.com\/page\/\d+/,
    chapterListSelector: ".chapter .chapter-item a",
    chapterTitleSelector: "h1, .muye-reader-title",
    chapterContentSelector: ".muye-reader-content",
    parsePreview: (html, url) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return {
            bookName: doc.querySelector('.info-name h1')?.textContent.trim(),
            authorName: doc.querySelector('.info-author')?.textContent.trim() || "Fanqie Author",
            coverImage: doc.querySelector('.book-cover-img')?.src,
            description: doc.querySelector('.page-abstract-content p')?.textContent.trim() || doc.querySelector('.page-abstract-content')?.textContent.trim(),
            sourceBookCode: url.match(/page\/(\d+)/)?.[1],
            url: url
        };
    },
    fetchChapters: async (url, progressCallback) => {
        progressCallback("Đang phân tích danh sách chương...");
        const tab = await chrome.tabs.create({ url: url, active: false });

        try {
            // Đợi trang load
            let found = false;
            const selector = ".chapter .chapter-item a";
            for (let i = 0; i < 20; i++) {
                const [{ result: count }] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: "MAIN",
                    args: [selector],
                    func: (sel) => document.querySelectorAll(sel).length
                });
                if (count > 0) { found = true; break; }
                await new Promise(r => setTimeout(r, 500));
            }

            if (!found) throw new Error("Không tìm thấy danh sách chương");

            const [{ result: chapters }] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                args: [selector],
                func: (sel) => {
                    const elements = [...document.querySelectorAll(sel)];
                    return elements.map((el, i) => {
                        const isVip = el.nextElementSibling && el.nextElementSibling.classList.contains('muyeicon-lock');
                        const title = el.textContent?.replace(/\s+/g, ' ').trim() || `Chương ${i + 1}`;
                        let href = el.getAttribute('href') || '';
                        let fullUrl = el.href;
                        if (href.startsWith('/')) {
                            fullUrl = `https://fanqienovel.com${href}`;
                        }

                        return {
                            chapter_number: i + 1,
                            chapter_title: title,
                            chapter_url: fullUrl,
                            type: isVip ? "vip" : "normal",
                        };
                    }).filter(c => c.chapter_url);
                }
            });

            return chapters;
        } finally {
            chrome.tabs.remove(tab.id).catch(() => { });
        }
    },
    parseContent: async (container) => {
        const logs = [];
        const log = (msg) => { logs.push(msg); };

        const loadScript = (src) => new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error("Failed to load: " + src));
            document.head.appendChild(s);
        });

        const withTimeout = (promise, ms, stepName) => {
            let tid;
            const tp = new Promise((_, reject) => {
                tid = setTimeout(() => reject(new Error(`[Timeout ${ms}ms] ${stepName}`)), ms);
            });
            return Promise.race([promise, tp]).finally(() => clearTimeout(tid));
        };

        try {
            log("1. Tải html2canvas...");
            await withTimeout(
                loadScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js'),
                10000, "Load html2canvas"
            );

            // ⚠️ Quan trọng: chờ tất cả font CJK load xong trước khi chụp
            log("2. Chờ font chữ render xong...");
            await document.fonts.ready;
            // Thêm 500ms buffer phòng font vẫn chưa apply vào DOM
            await new Promise(r => setTimeout(r, 500));
            log("-> Fonts sẵn sàng!");

            log("3. Chụp ảnh bằng html2canvas...");
            const canvas = await withTimeout(
                html2canvas(container, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                }),
                30000, "html2canvas render"
            );

            log("4. Tạo DataURL từ ảnh...");
            const dataUrl = canvas.toDataURL('image/png');
            log(`-> Ảnh đã tạo xong, kích thước base64: ${dataUrl.length} ký tự`);

            log("-> Yêu cầu Background Script thực hiện OCR ở một tab an toàn (tránh CSP của Fanqie).");
            return { paragraphs: [], dataUrl, logs, needOCR: true };

        } catch (err) {
            log(`LỖI: ${err.message}`);
            return {
                paragraphs: [`[LỖI] ${err.message}`, ...logs],
                dataUrl: null,
                logs
            };
        }
    }
};

