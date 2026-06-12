const SourceUukanshu = {
  name: "uukanshu",
  maxWorkers: 1,
  pattern: /uukanshu\.cc\/book\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".bookinfo h1.booktitle",
      authorName:     ".bookinfo p.booktag a.red",
      coverImage:     { selector: ".bookcover img", attr: "src" },
      description:    {
        custom: (doc) => doc.querySelector('.bookinfo p.bookintro')?.textContent.trim().slice(0, 200) || null
      },
      sourceBookCode: { urlPattern: /book\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "fetch",
    listUrl: (url) => url,
    fetchOptions: {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://uukanshu.cc/",
      }
    },
    extract: (doc, url) => {
      const selectors = [
        "#list-chapterAll > div > dd > a",
        "#list-chapterAll dd a",
        ".chapter-list a",
        "#chapterList a",
      ];
      let elements = [];
      for (const sel of selectors) {
        elements = [...doc.querySelectorAll(sel)];
        if (elements.length > 0) break;
      }
      if (elements.length === 0) throw new Error("Không tìm thấy danh sách chương");

      return elements.map((el, i) => {
        const href  = el.getAttribute("href");
        const title = el.textContent.trim();
        if (!href) return null;
        return {
          chapter_number: i + 1,
          chapter_title:  title || `Chapter ${i + 1}`,
          chapter_url:    href.startsWith("/") ? `https://uukanshu.cc${href}` : href,
          type: "normal"
        };
      }).filter(Boolean);
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".readcotent",
    type:          "text",
    selector:      ".readcotent",
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview);         },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); },
};
