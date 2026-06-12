const SourceJjwxc = {
  name: "jjwxc",
  pattern: /jjwxc\.net\/onebook\.php\?novelid=\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       "h1",
      authorName:     "a[href*='oneauthor.php']",
      coverImage:     { selector: "td img[width]", attr: ["_src", "src"] },
      description:    {
        custom: (doc) => {
          for (const td of doc.querySelectorAll("td")) {
            const t = td.textContent.trim();
            if (t.length > 100 && t.length < 600) return t.slice(0, 200);
          }
          return null;
        }
      },
      sourceBookCode: { urlPattern: /novelid=(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "tab",
    listUrl: (url) => url,
    // readySelector phụ thuộc novelId — computed từ URL
    readySelector: (url) => {
      const id = url.match(/novelid=(\d+)/)?.[1];
      return `a[href*='novelid=${id}&chapterid=']`;
    },
    // extract được inject vào tab, nhận novelId qua arg
    extract: (novelId) => {
      const rows = [...document.querySelectorAll("tr[itemprop='chapter']")];
      let n = 1;
      const result = [];
      for (const row of rows) {
        const a = row.querySelector("span[itemprop='headline'] a[itemprop='url']");
        if (!a) continue;
        const title  = a.textContent.trim();
        const href   = a.getAttribute("href");
        const rel    = a.getAttribute("rel");
        const rawUrl = href || rel;
        if (!rawUrl) continue;
        const isVip  = !!rel && !href;
        const full   = (rawUrl.startsWith("http")
          ? rawUrl
          : `https://www.jjwxc.net/${rawUrl.replace(/^\//, "")}`)
          .replace(/^http:\/\//, "https://");
        result.push({ chapter_number: n++, chapter_title: title, chapter_url: full, type: isVip ? "vip" : "normal" });
      }
      return result;
    },
    extractArgs: (url) => [url.match(/novelid=(\d+)/)?.[1]]
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    // Chờ span thật xuất hiện (không phải wrapper rỗng)
    readySelector: "#paragraph_comment_content .onebook_paragraph_comment_text",
    type:          "spans",
    selector:      "#paragraph_comment_content .onebook_paragraph_comment_text",
    fallbacks: [
      { type: "text", selector: "div.novelbody div[style*='cursor']" },
      { type: "text", selector: "div.novelbody" }
    ]
  },

  // ── Public API (thin wrappers — for backward compat với popup.js) ──────────
  parsePreview(html, url)          { return parsePreview(html, url, this.preview);           },
  fetchChapters(url, progressCb)   { return parseChapters(url, this.chapters, progressCb);   },
};