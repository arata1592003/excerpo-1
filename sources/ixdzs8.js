const SourceIxdzs8 = {
  name: "ixdzs8",
  maxWorkers: 1,
  downloadDelay: 2000,
  pattern: /ixdzs8?\.[a-z]+\/read\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName:       ".n-text h1",
      authorName:     ".n-text a.bauthor",
      coverImage:     { selector: ".n-img img", attr: "src" },
      description:    {
        custom: (doc) => {
          const el = doc.querySelector("#intro") || doc.querySelector(".pintro");
          if (!el) return null;
          const clone = el.cloneNode(true);
          clone.querySelector(".c-more")?.remove();
          return clone.textContent.trim() || null;
        }
      },
      sourceBookCode: { urlPattern: /read\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "tab",
    readySelector: ".catalog-all",
    extract: async (selector) => {
      const btn = document.querySelector(".catalog-all");
      if (btn) {
        btn.click();
        // Wait up to 5 seconds for the chapter list to populate
        for (let j = 0; j < 50; j++) {
          if (document.querySelectorAll(".clist .u-chapter li a").length > 0) {
            break;
          }
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      let elements = [...document.querySelectorAll(".clist .u-chapter li a")];
      if (elements.length === 0) {
        // Fallback to static list if clist was not loaded or not present
        elements = [...document.querySelectorAll(".u-chapter li a")];
      }

      // Sort chapters by their ordernum extracted from URL (e.g., /p1.html -> 1)
      const getOrder = (url) => {
        const match = url.match(/\/p(\d+)\.html/);
        return match ? parseInt(match[1], 10) : 0;
      };

      const mapped = elements.map((el) => {
        return {
          chapter_title:  el.textContent.replace(/\s+/g, ' ').trim(),
          chapter_url:    el.href,
          type:           "normal"
        };
      }).filter(c => c.chapter_url && !c.chapter_url.includes('javascript:'));

      mapped.sort((a, b) => getOrder(a.chapter_url) - getOrder(b.chapter_url));

      mapped.forEach((c, idx) => {
        c.chapter_number = idx + 1;
      });

      return mapped;
    },
    extractArgs: () => [".clist .u-chapter li a"]
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".page-content section",
    type:          "paragraphs",
    selector:      ".page-content section",
    fallbacks: [
      { type: "text", selector: ".page-content section" },
      { type: "paragraphs", selector: ".page-content" },
      { type: "text", selector: ".page-content" }
    ],
    remove:        []
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview);         },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
