const SourceSyosetu = {
  name: "syosetu",
  pattern: /(?:ncode|novel18)\.syosetu\.com\/([^\/]+)/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName: {
        custom: (doc) => {
          return doc.querySelector('h1.p-novel__title')?.textContent.trim() 
            || doc.querySelector('.p-novel__title')?.textContent.trim() 
            || doc.querySelector('title')?.textContent.trim() 
            || "";
        }
      },
      authorName: {
        custom: (doc) => {
          const authorEl = doc.querySelector('.p-novel__author');
          if (!authorEl) return "";
          return authorEl.textContent.replace(/^作者：/, "").trim();
        }
      },
      coverImage: {
        custom: () => null
      },
      description: {
        custom: (doc) => {
          return doc.querySelector('#novel_ex')?.textContent.trim()
            || doc.querySelector('.p-novel__summary')?.textContent.trim()
            || "";
        }
      },
      sourceBookCode: { urlPattern: /syosetu\.com\/([^\/]+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "fetch",
    extract: (doc, url) => {
      const elements = [...doc.querySelectorAll(".p-eplist__sublist a.p-eplist__subtitle, .p-eplist__subtitle")];
      return elements.map((el, i) => {
        const href = el.getAttribute('href') || '';
        const host = new URL(url).origin;
        const fullUrl = href.startsWith('/')
          ? `${host}${href}`
          : href;
        return {
          chapter_number: i + 1,
          chapter_title: el.textContent.replace(/\s+/g, ' ').trim(),
          chapter_url: fullUrl,
          type: "normal"
        };
      }).filter(c => c.chapter_url);
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".p-novel__text",
    type:          "paragraphs",
    selector:      ".p-novel__text"
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview); },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
