const SourceFanqienovel = {
  name: "fanqienovel",
  maxWorkers: 1, // Tránh chạy nhiều OCR cùng lúc
  downloadDelay: 2000,
  pattern: /fanqienovel\.com\/page\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".info-name h1",
      authorName:     {
        custom: (doc) => doc.querySelector('.info-author')?.textContent.trim() || "Fanqie Author"
      },
      coverImage:     { selector: ".book-cover-img", attr: "src" },
      description:    ".page-abstract-content p | .page-abstract-content",
      sourceBookCode: { urlPattern: /page\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "tab",
    listUrl: (url) => url,
    readySelector: ".chapter .chapter-item a",
    extract: (selector) => {
      const elements = [...document.querySelectorAll(selector)];
      return elements.map((el, i) => {
        const isVip = el.nextElementSibling?.classList.contains('muyeicon-lock');
        const title = el.textContent?.replace(/\s+/g, ' ').trim() || `Chương ${i + 1}`;
        const href  = el.getAttribute('href') || '';
        const fullUrl = href.startsWith('/')
          ? `https://fanqienovel.com${href}`
          : el.href;
        return {
          chapter_number: i + 1,
          chapter_title:  title,
          chapter_url:    fullUrl,
          type:           isVip ? "vip" : "normal",
        };
      }).filter(c => c.chapter_url);
    },
    extractArgs: () => [".chapter .chapter-item a"]
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".muye-reader-content",
    type:          "ocr",
    selector:      ".muye-reader-content",
    scriptUrl:     "https://html2canvas.hertzen.com/dist/html2canvas.min.js"
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview);         },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); },
};
