const Source52shuku = {
  name: "52shuku",
  pattern: /52shuku\.net\/[^/]+\/.*\.html/,
  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName: "h1",
      authorName: ".info a",
      coverImage: { selector: ".content img", attr: "src" },
      description: {
        custom: (doc) =>
          doc.querySelector(".content")?.textContent.trim().substring(0, 200),
      },
      sourceBookCode: { urlPattern: /([^\/]+)\.html$/ },
    },
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "fetch",
    extract: (doc, url) => {
      const links = doc.querySelectorAll("ul.list li.mulu a");
      return [...links]
        .map((el, i) => {
          let href = el.getAttribute("href") || "";
          return {
            chapter_number: i + 1,
            chapter_title: el.textContent.trim(),
            chapter_url: new URL(href, url).href,
            type: "normal",
          };
        })
        .filter((c) => c.chapter_url && !c.chapter_url.includes("javascript:"));
    },
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: "article.content | .content | .article-content",
    type: "paragraphs",
    selector: "article.content | .content | .article-content",
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url) {
    return parsePreview(html, url, this.preview);
  },
  fetchChapters(url, progressCb) {
    return parseChapters(url, this.chapters, progressCb);
  },
};
