const SourceQidian = {
  name: "qidian",
  pattern: /qidian\.com\/book\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       "#bookName | .book-info h1 em",
      authorName:     {
        custom: (doc) => {
          const t = doc.querySelector('.author')?.textContent.trim() || doc.querySelector('.book-info h1 span a')?.textContent.trim();
          return t ? t.replace(/^作者:/, "").trim() : null;
        }
      },
      coverImage:     { selector: "#bookImg img | .book-img img", attr: "src" },
      description:    ".intro | .book-intro p",
      sourceBookCode: { urlPattern: /book\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "fetch",
    extract: (doc, url) => {
      let elements = [];
      const selectors = [".volume-chapters .chapter-name", ".catalog-volume .chapter-name", "#catalog-content .chapter-name"];
      
      for (const sel of selectors) {
        elements = [...doc.querySelectorAll(sel)];
        if (elements.length > 0) break;
      }

      return elements.map((el, i) => {
        const li = el.closest('li');
        const isVip = li && li.querySelector('.chapter-locked');
        let title = el.textContent.trim();
        let href = el.getAttribute("href") || "";
        
        return {
          chapter_number: i + 1,
          chapter_title:  title,
          chapter_url:    href.startsWith('//') ? `https:${href}` : href,
          type:           isVip ? "vip" : "normal",
        };
      }).filter(c => c.chapter_url);
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: "main.content | .main-text-wrap .read-content | .read-content.j_readContent",
    type:          "paragraphs",
    selector:      "main.content | .main-text-wrap .read-content | .read-content.j_readContent",
    remove:        [".review"]
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview); },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
