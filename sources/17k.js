const Source17k = {
  name: "17k",
  maxWorkers: 1,
  pattern: /17k\.com\/book\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".info h1 | .BookInfo h1",
      authorName:     ".author a.name | .AuthorInfo .name",
      coverImage:     { selector: ".cover img | .BookInfo img", attr: "src" },
      description:    ".intro",
      sourceBookCode: { urlPattern: /book\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "tab",
    listUrl: (url) => {
      const id = url.match(/book\/(\d+)/)?.[1];
      return `https://www.17k.com/list/${id}.html`;
    },
    readySelector: ".Volume dd a",
    extract: (selector) => {
      return [...document.querySelectorAll(selector)].map((el, i) => {
        const span  = el.querySelector('span');
        const isVip = span?.classList.contains('vip');
        const title = span?.textContent?.trim()
                   || el.textContent?.replace(/\s+/g, ' ').trim()
                   || `Chương ${i + 1}`;
        const href  = el.getAttribute('href') || '';
        return {
          chapter_number: i + 1,
          chapter_title:  title,
          chapter_url:    href.startsWith('/') ? `https://www.17k.com${href}` : el.href,
          type:           isVip ? "vip" : "normal",
        };
      }).filter(c =>
        c.chapter_url &&
        c.chapter_url.includes('/chapter/') &&
        !c.chapter_url.includes('javascript:') &&
        !c.chapter_title.includes('登录')
      );
    },
    extractArgs: () => [".Volume dd a"]
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".readAreaBox.content .p",
    type:          "paragraphs",
    selector:      ".readAreaBox.content .p | .readAreaBox.content",
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview);         },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); },
};
