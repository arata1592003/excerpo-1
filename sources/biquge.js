const SourceBiquge = {
  name: "biquge",
  pattern: /biquge\.tw\/book\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".book .right h1 a | .book .right h1 | #info h1",
      authorName:     {
        custom: (doc) => {
          let t = doc.querySelector('.book .right h2 span a')?.textContent.trim();
          if (!t) {
            t = doc.querySelector('#info p')?.textContent.trim();
            if (t) t = t.replace(/作\s*者：/, "").trim();
          }
          return t || null;
        }
      },
      coverImage:     { selector: ".book .cover img | #fmimg img", attr: "src" },
      description:    ".book .intro p | .book .intro | #intro",
      sourceBookCode: { urlPattern: /book\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "fetch",
    listUrl: (url) => url.endsWith('.html') ? url.replace(/\.html$/, '/') : url,
    extract: (doc, url) => {
      // Dùng các class/id thông dụng của list chapter biquge, thêm ul li a cho giao diện mới
      const links = doc.querySelectorAll("#list dd a, .listmain dd a, .chapterlist dd a, .book ul li a, ul li a");
      return [...links].map((el, i) => {
        let href = el.getAttribute("href") || "";
        
        // Link chương phải có đuôi .html
        if (!href.endsWith('.html') || href.includes('javascript:')) return null;

        // Biquge thường dùng href dạng /book/123/456.html
        let fullUrl = href.startsWith('/') ? `https://www.biquge.tw${href}` : new URL(href, url).href;
        return {
          chapter_number: i + 1,
          chapter_title:  el.textContent.trim(),
          chapter_url:    fullUrl,
          type:           "normal"
        };
      }).filter(Boolean); // Lọc bỏ null
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: "#chaptercontent | .read-content | #content",
    type:          "paragraphs",
    selector:      "#chaptercontent | .read-content",
    fallbacks: [
      { selector: "#content", type: "text" }
    ]
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview); },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
