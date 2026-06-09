const SourceJjwxc = {
  name: "jjwxc",
  pattern: /jjwxc\.net\/onebook\.php\?novelid=\d+/,
  chapterListSelector: "#onebooktpl tr[itemprop='chapter'] a",
  chapterTitleSelector: "h1",
  chapterContentSelector: "div.novelbody div[style*='cursor'], div.novelbody",

  parsePreview: (html, url) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const bookName = doc.querySelector("h1")?.textContent.trim()
      || doc.title?.split(/[_|]/)[0]?.trim()
      || null;

    const authorName = doc.querySelector("a[href*='oneauthor.php']")?.textContent.trim() || null;

    const imgTag = doc.querySelector("td img[width]");
    const coverImage = imgTag?.getAttribute("_src") || imgTag?.src || null;

    let description = null;
    for (const td of doc.querySelectorAll("td")) {
      const t = td.textContent.trim();
      if (t.length > 100 && t.length < 600) {
        description = t.slice(0, 200);
        break;
      }
    }

    return {
      bookName,
      authorName,
      coverImage,
      description,
      sourceBookCode: url.match(/novelid=(\d+)/)?.[1] || null,
      url
    };
  },

  fetchChapters: async (url, progressCallback) => {
    progressCallback("Đang lấy danh sách chương...");

    const novelId = url.match(/novelid=(\d+)/)?.[1];
    if (!novelId) throw new Error("Không lấy được novel ID");

    const tab = await chrome.tabs.create({ url, active: false });
    try {
      let found = false;
      const selector = `a[href*='novelid=${novelId}&chapterid=']`;
      for (let i = 0; i < 20; i++) {
        const [{ result: count }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          args: [selector],
          func: (sel) => document.querySelectorAll(sel).length
        });
        if (count > 0) { found = true; break; }
        await new Promise(r => setTimeout(r, 500));
      }

      if (!found) throw new Error("Không tìm thấy danh sách chương");

      const [{ result: chapters }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        args: [novelId],
        func: (novelId) => {
          // Lấy tất cả link có itemprop="url" trong row chapter
          const rows = [...document.querySelectorAll("tr[itemprop='chapter']")];
          let chapterNumber = 1;
          const result = [];

          for (const row of rows) {
            const linkEl = row.querySelector("span[itemprop='headline'] a[itemprop='url']");
            if (!linkEl) continue;

            const title = linkEl.textContent.trim();

            // Chương thường: dùng href
            // Chương VIP: dùng rel (URL thật nằm ở đây)
            const href = linkEl.getAttribute("href");
            const rel = linkEl.getAttribute("rel");
            const rawUrl = href || rel;

            if (!rawUrl) continue;

            const isVip = !!rel && !href;
            const fullUrl = (rawUrl.startsWith("http")
              ? rawUrl
              : `https://www.jjwxc.net/${rawUrl.replace(/^\//, "")}`)
              .replace(/^http:\/\//, "https://");

            result.push({
              chapter_number: chapterNumber++,
              chapter_title: title,
              chapter_url: fullUrl,
              type: isVip ? "vip" : "normal"
            });
          }

          return result;
        }
      });

      return chapters;
    } finally {
      chrome.tabs.remove(tab.id).catch(() => { });
    }
  },
  parseContent: (container) => {
    const clone = container.cloneNode(true);

    // Xóa các div con không phải content (navigation, bookmark, danmu...)
    clone.querySelectorAll("div, script, style").forEach(el => el.remove());

    // Thay <br> bằng newline
    clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));

    return clone.textContent
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  },
};