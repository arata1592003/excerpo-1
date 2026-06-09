const Source22biqu = {
  name: "22biqu",
  maxWorkers: 1,
  pattern: /22biqu\.com\/biqu\d+/,
  chapterListSelector: ".layout-col1 > .section-box:last-child > ul.section-list.fix > li > a",
  chapterTitleSelector: "#container h1",
  chapterContentSelector: "#content",

  parsePreview: (html, url) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const codeMatch = url.match(/(biqu\d+)/);
    const sourceBookCode = codeMatch ? codeMatch[1] : null;

    let authorName = doc.querySelector(".info .top p")?.textContent.trim() || null;
    if (authorName) {
      authorName = authorName.replace(/^作\s*者：/, "").trim();
    }

    return {
      bookName: doc.querySelector(".info h1")?.textContent.trim() || null,
      authorName,
      coverImage: doc.querySelector(".imgbox img")?.src || null,
      description: doc.querySelector(".introduce")?.textContent.trim()?.slice(0, 200) || null,
      sourceBookCode,
      url
    };
  },

  fetchChapters: async (url, progressCallback) => {
    let currentUrl = url;
    let chapterNumber = 1;
    const chapters = [];
    const visitedUrls = new Set();

    while (true) {
      if (visitedUrls.has(currentUrl)) break;
      visitedUrls.add(currentUrl);

      progressCallback(`Đang lấy danh sách chương: ${currentUrl}`);

      const resp = await fetch(currentUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Referer": "https://www.22biqu.com/",
        }
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Lấy đúng box thứ 2 (index 1) - danh sách chương chính
      const sectionBoxes = doc.querySelectorAll(".layout-col1 .section-box");
      const targetBox = sectionBoxes[1] ?? sectionBoxes[0];
      const links = targetBox
        ? targetBox.querySelectorAll("ul.section-list.fix li a")
        : [];

      for (const a of links) {
        const href = a.getAttribute("href");
        const title = a.textContent.trim();
        if (!href || !title) continue;

        chapters.push({
          chapter_number: chapterNumber++,
          chapter_title: title,
          chapter_url: new URL(href, currentUrl).href,
          type: "normal"
        });
      }

      // Dùng select#indexselect để tìm trang tiếp theo
      const options = [...doc.querySelectorAll("#indexselect option")];
      const selectedIndex = options.findIndex(o => o.hasAttribute("selected"));
      const nextOption = options[selectedIndex + 1];
      const nextHref = nextOption?.getAttribute("value");

      if (!nextHref) break;

      currentUrl = new URL(nextHref, currentUrl).href;
      await new Promise(r => setTimeout(r, 300));
    }

    return chapters;
  },
  parseContent: (container) => {
    const clone = container.cloneNode(true);
    clone.querySelectorAll("script, style, iframe").forEach(el => el.remove());
    return Array.from(clone.querySelectorAll("p"))
      .map(p => p.textContent.trim())
      .filter(s => s.length > 0);
  },
};