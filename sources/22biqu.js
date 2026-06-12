const Source22biqu = {
  name: "22biqu",
  maxWorkers: 1,
  pattern: /22biqu\.com\/biqu\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".info h1",
      authorName:     {
        custom: (doc) => {
          const t = doc.querySelector(".info .top p")?.textContent.trim();
          return t ? t.replace(/^作\s*者：/, "").trim() : null;
        }
      },
      coverImage:     { selector: ".imgbox img", attr: "src" },
      description:    {
        custom: (doc) => doc.querySelector(".introduce")?.textContent.trim().slice(0, 200) || null
      },
      sourceBookCode: { urlPattern: /(?:biqu|book\/)(\d+)/ }
    }
  },

  // ── Chapters config — custom vì cần pagination nhiều trang ────────────────
  chapters: {
    method: "custom",
    custom: async (url, progressCallback) => {
      // 22biqu mới (biquge.tw) tách list chapter ra thư mục gốc
      let currentUrl  = url.endsWith('.html') ? url.replace(/\.html$/, '/') : url;
      let chapterNumber = 1;
      const chapters    = [];
      const visited     = new Set();

      while (true) {
        if (visited.has(currentUrl)) break;
        visited.add(currentUrl);
        progressCallback(`Đang lấy danh sách chương: ${currentUrl}`);

        const resp = await fetch(currentUrl, {
          headers: {
            "Accept":          "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer":         "https://www.22biqu.com/",
          }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const doc  = new DOMParser().parseFromString(await resp.text(), "text/html");
        const boxes = doc.querySelectorAll(".layout-col1 .section-box");
        const box   = boxes[1] ?? boxes[0];
        const links = box ? box.querySelectorAll("ul.section-list.fix li a") : [];

        for (const a of links) {
          const href  = a.getAttribute("href");
          const title = a.textContent.trim();
          if (!href || !title) continue;
          chapters.push({
            chapter_number: chapterNumber++,
            chapter_title:  title,
            chapter_url:    new URL(href, currentUrl).href,
            type: "normal"
          });
        }

        const options = [...doc.querySelectorAll("#indexselect option")];
        const nextHref = options[options.findIndex(o => o.hasAttribute("selected")) + 1]
          ?.getAttribute("value");
        if (!nextHref) break;

        currentUrl = new URL(nextHref, currentUrl).href;
        await new Promise(r => setTimeout(r, 300));
      }

      return chapters;
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: "#content p",
    type:          "paragraphs",
    selector:      "#content",
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview);         },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); },
};