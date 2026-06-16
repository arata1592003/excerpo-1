const SourcePixiv = {
  name: "pixiv",
  pattern: /pixiv\.net\/novel\/series\/(\d+)/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName: {
        custom: (doc) => {
          const title = doc.querySelector('title')?.textContent || "";
          const match = title.match(/「([^」]+)」\/「([^」]+)」のシリーズ/);
          return match ? match[1].trim() : title.replace(/のシリーズ.*$/, "").trim();
        }
      },
      authorName: {
        custom: (doc) => {
          const title = doc.querySelector('title')?.textContent || "";
          const match = title.match(/「([^」]+)」\/「([^」]+)」のシリーズ/);
          return match ? match[2].trim() : "";
        }
      },
      coverImage: {
        custom: (doc) => {
          return doc.querySelector('meta[property="og:image"]')?.getAttribute('content') 
            || doc.querySelector('meta[property="twitter:image"]')?.getAttribute('content') 
            || null;
        }
      },
      description: {
        custom: (doc) => {
          return doc.querySelector('meta[name="description"]')?.getAttribute('content') 
            || doc.querySelector('meta[property="og:description"]')?.getAttribute('content') 
            || "";
        }
      },
      sourceBookCode: { urlPattern: /series\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "custom",
    custom: async (url, progressCb) => {
      const match = url.match(/series\/(\d+)/);
      if (!match) throw new Error("Không thể tìm thấy ID series từ URL.");
      const seriesId = match[1];
      const chapters = [];
      let lastOrder = 0;
      let hasMore = true;

      while (hasMore) {
        progressCb(`Đang tải danh sách chương (offset order ${lastOrder})...`);
        const apiUrl = `https://www.pixiv.net/ajax/novel/series_content/${seriesId}?limit=30&last_order=${lastOrder}&order_by=asc&lang=en`;
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`Lỗi tải API danh sách chương: HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(`Lỗi từ API Pixiv: ${data.message}`);

        const novels = data.body?.thumbnails?.novel || [];
        if (novels.length === 0) {
          hasMore = false;
          break;
        }

        novels.forEach((novel) => {
          chapters.push({
            chapter_number: chapters.length + 1,
            chapter_title: novel.title.replace(/\s+/g, ' ').trim(),
            chapter_url: `https://www.pixiv.net/novel/show.php?id=${novel.id}`,
            type: "normal"
          });
        });

        if (novels.length < 30) {
          hasMore = false;
        } else {
          lastOrder = novels[novels.length - 1].seriesContentOrder;
        }
      }

      return chapters;
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: "main",
    type:          "custom",
    selector:      "body"
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview); },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
