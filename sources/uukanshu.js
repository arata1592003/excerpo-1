const SourceUukanshu = {
  name: "uukanshu",
  maxWorkers: 1,
  pattern: /uukanshu\.cc\/book\/\d+/,
  chapterListSelector: ".list li a",
  chapterTitleSelector: ".title h1",
  chapterContentSelector: ".readcotent",
  parsePreview: (html, url) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return {
      bookName: doc.querySelector('.bookinfo h1.booktitle')?.textContent.trim() || null,
      authorName: doc.querySelector('.bookinfo p.booktag a.red')?.textContent.trim() || null,
      coverImage: doc.querySelector('.bookcover img')?.src || null,
      description: doc.querySelector('.bookinfo p.bookintro')?.textContent.trim().slice(0, 200) || null,
      sourceBookCode: url.match(/book\/(\d+)/)?.[1] || null,
      url
    };
  },
  fetchChapters: async (url, progressCallback) => {
    progressCallback(`Đang lấy danh sách chương: ${url}`);
    const resp = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://uukanshu.cc/",
      }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectors = [
      "#list-chapterAll > div > dd > a",
      "#list-chapterAll dd a",
      ".chapter-list a",
      "#chapterList a",
    ];
    let elements = [];
    for (const sel of selectors) {
      elements = [...doc.querySelectorAll(sel)];
      if (elements.length > 0) break;
    }
    if (elements.length === 0) throw new Error("Không tìm thấy danh sách chương");
    return elements
      .map((el, i) => {
        const href = el.getAttribute("href");
        const title = el.textContent.trim();
        if (!href) return null;
        return {
          chapter_number: i + 1,
          chapter_title: title || `Chapter ${i + 1}`,
          chapter_url: href.startsWith("/") ? `https://uukanshu.cc${href}` : href,
          type: "normal"
        };

      })
      .filter(Boolean);

  },
  parseContent: (container) => {
    const clone = container.cloneNode(true);
    // Xóa script rác (loadAdv) và các tag không cần
    clone.querySelectorAll("script, style, iframe").forEach(el => el.remove());
    // Thay <br> thành \n rồi split
    clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return clone.textContent
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  },
};
