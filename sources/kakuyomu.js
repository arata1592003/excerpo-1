const SourceKakuyomu = {
  name: "kakuyomu",
  pattern: /kakuyomu\.jp\/works\/\d+/,

  // ── Preview config ─────────────────────────────────────────────────────────
  preview: {
    fields: {
      bookName: {
        custom: (doc) => {
          return doc.querySelector('h1 a')?.textContent.trim() 
            || doc.querySelector('h1')?.textContent.trim() 
            || doc.querySelector('title')?.textContent.split('（')[0]?.trim() 
            || "";
        }
      },
      authorName: {
        custom: (doc) => {
          return doc.querySelector('.partialGiftWidgetActivityName a')?.textContent.trim()
            || doc.querySelector('a[href^="/users/"]')?.textContent.trim()
            || "";
        }
      },
      coverImage: {
        custom: (doc) => {
          return doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || "";
        }
      },
      description: {
        custom: (doc) => {
          return doc.querySelector('[class*="CollapseTextWithKakuyomuLinks_collapseText"]')?.textContent.trim()
            || doc.querySelector('.CollapseTextWithKakuyomuLinks_collapseText__XSlmz')?.textContent.trim()
            || doc.querySelector('meta[name="description"]')?.getAttribute('content')
            || "";
        }
      },
      sourceBookCode: { urlPattern: /works\/(\d+)/ }
    }
  },

  // ── Chapters config ────────────────────────────────────────────────────────
  chapters: {
    method: "fetch",
    extract: (doc, url) => {
      const match = url.match(/works\/(\d+)/);
      if (!match) throw new Error("URL không hợp lệ");
      const workId = match[1];

      const scriptEl = doc.getElementById('__NEXT_DATA__');
      if (!scriptEl) throw new Error("Không tìm thấy dữ liệu __NEXT_DATA__");

      const json = JSON.parse(scriptEl.textContent);
      const apollo = json?.props?.pageProps?.__APOLLO_STATE__;
      if (!apollo) throw new Error("Không tìm thấy dữ liệu __APOLLO_STATE__");

      const targetWork = apollo[`Work:${workId}`];
      if (!targetWork) throw new Error(`Không tìm thấy thông tin tác phẩm Work:${workId}`);

      const tableOfContents = targetWork.tableOfContentsV2 || [];
      const episodes = [];

      for (const itemRef of tableOfContents) {
        const item = apollo[itemRef.__ref];
        if (!item) continue;
        if (item.episodeUnions) {
          for (const epRef of item.episodeUnions) {
            const ep = apollo[epRef.__ref];
            if (ep && ep.__typename === 'Episode') {
              episodes.push(ep);
            }
          }
        }
      }

      return episodes.map((ep, i) => {
        return {
          chapter_number: i + 1,
          chapter_title: ep.title,
          chapter_url: `https://kakuyomu.jp/works/${workId}/episodes/${ep.id}`,
          type: "normal",
        };
      });
    }
  },

  // ── Content config ─────────────────────────────────────────────────────────
  content: {
    readySelector: ".widget-episodeBody",
    type:          "paragraphs",
    selector:      ".widget-episodeBody"
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  parsePreview(html, url)        { return parsePreview(html, url, this.preview); },
  fetchChapters(url, progressCb) { return parseChapters(url, this.chapters, progressCb); }
};
