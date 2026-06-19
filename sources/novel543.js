const SourceNovel543 = {
  name: "novel543",
  maxWorkers: 1,
  downloadDelay: 2000,
  pattern: /novel543\.com\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".info h1.title",
      authorName:     ".info span.author",
      coverImage:     { selector: ".cover img", attr: "src" },
      description:    ".intro",
      sourceBookCode: { urlPattern: /(?:com\/|dir\/)?(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "tab",
    listUrl: (url) => {
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      if (cleanUrl.endsWith('/dir')) return cleanUrl;
      return cleanUrl + '/dir';
    },
    readySelector: ".chaplist ul.all li a",
    extract: (selector) => {
      const elements = [...document.querySelectorAll(selector)];
      return elements.map((el, i) => {
        return {
          chapter_number: i + 1,
          chapter_title:  el.textContent.replace(/\s+/g, ' ').trim(),
          chapter_url:    el.href,
          type:           "normal"
        };
      }).filter(c => c.chapter_url && !c.chapter_url.includes('javascript:'));
    },
    extractArgs: () => [".chaplist ul.all li a"]
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".content[data-merged='true']",
    type:          "paragraphs",
    selector:      ".content[data-merged='true']",
    remove:        [".adBlock", ".gadBlock", "#div-onead-nd-02", ".content > div:last-child"]
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview);         },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
