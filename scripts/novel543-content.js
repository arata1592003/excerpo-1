// scripts/novel543-content.js
// Content script to handle split chapters (multi-part pages) on novel543.com

if (location.pathname.match(/^\/\d+\/\d+/)) {
  const h1 = document.querySelector('#chapterWarp > div.chapter-content.px-3 > h1') || document.querySelector('h1');
  const container = document.querySelector('.content');

  if (h1 && container) {
    const titleText = h1.textContent.trim();
    const match = titleText.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);

    if (!match) {
      // Single-part chapter: immediately mark as merged
      container.setAttribute('data-merged', 'true');
    } else {
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);

      if (current === 1) {
        // Part 1: Start a new merge session
        const ps = [...container.querySelectorAll('p')].map(p => p.outerHTML);
        sessionStorage.setItem('novel543_paragraphs', JSON.stringify(ps));
        sessionStorage.setItem('novel543_origin', location.href);

        // Find next part URL and navigate
        const nextA = [...document.querySelectorAll('div.foot-nav a')].find(el => el.textContent.includes('下一章'));
        if (nextA && nextA.href) {
          location.href = nextA.href;
        } else {
          // If no next link found, mark as merged
          container.setAttribute('data-merged', 'true');
        }
      } else {
        // Middle or final part
        const origin = sessionStorage.getItem('novel543_origin');
        if (!origin) {
          // If navigated directly to a part without starting from part 1, just let it through
          container.setAttribute('data-merged', 'true');
        } else {
          let paragraphs = [];
          try {
            paragraphs = JSON.parse(sessionStorage.getItem('novel543_paragraphs')) || [];
          } catch (e) {
            paragraphs = [];
          }

          const ps = [...container.querySelectorAll('p')].map(p => p.outerHTML);
          paragraphs.push(...ps);

          if (current < total) {
            // Save state and go to next part
            sessionStorage.setItem('novel543_paragraphs', JSON.stringify(paragraphs));
            const nextA = [...document.querySelectorAll('div.foot-nav a')].find(el => el.textContent.includes('下一章'));
            if (nextA && nextA.href) {
              location.href = nextA.href;
            } else {
              container.setAttribute('data-merged', 'true');
            }
          } else {
            // Final part: write all paragraphs back to DOM
            container.innerHTML = paragraphs.join('');

            // Clean up title text to remove the pagination suffix, e.g. " (2/2)"
            h1.textContent = titleText.replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, '').trim();

            // Clear session storage
            sessionStorage.removeItem('novel543_paragraphs');
            sessionStorage.removeItem('novel543_origin');

            // Mark as merged so background script can proceed
            container.setAttribute('data-merged', 'true');
          }
        }
      }
    }
  }
}
