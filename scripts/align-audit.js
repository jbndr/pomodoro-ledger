// Paste into the browser console (or run through DevTools automation) on a running app.
// For each row that pairs a marker (circle, dot, icon) with text, it measures how far the marker's
// vertical centre sits from its target and lists every pair off by more than 1px. The target is the centre
// of the text's first line, or with "block" the centre of the whole text block (task rows center on it).
(() => {
  const PAIRS = [
    ["New task circle", ".add", ".add-check", "#newTitle"],
    ["Task circle", ".task:not(.open)", ":scope > .check", ".task-main", "block"],
    ["Task side dots", ".task:not(.open)", ".side-info .cyc", ".task-main", "block"],
    ["Task best-time mark", ".task:not(.open)", ".side-info .best-flag", ".task-main", "block"],
    ["Task handle", ".task:not(.open)", ":scope > .grip", ".task-main", "block"],
    ["Subtask box", ".subtask", "input[type=checkbox]", "input[type=text]"],
    ["Menu icon", ".bar-menu .item", "svg, i", ":scope"],
    ["Bulk bar icon", ".bulk-bar.open button:not(.bulk-x)", "svg", ":scope"],
    ["Work together", ".together", ".faces, svg", ".together-label"],
    ["Filter chip dot", ".label-filter button", ".label-dot", "span"],
    ["Row label dot", ".task-meta .meta-chip", ".label-dot", "span"],
    ["Session label dot", "#sesTable .meta-chip", ".label-dot", "span"],
    ["Stages lane swatch", ".sg-lane", ".sg-sw", ":scope > span"],
    ["Stages readout dot", ".sg-k", "i", ":scope"],
  ];
  const firstLine = (el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const top = r.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
      const inner = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
      return el.type === "checkbox" ? r.top + r.height / 2 : top + Math.min(lh, inner) / 2;
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && n.parentElement.closest("svg, .vh") == null ? 1 : 3) });
    const node = walker.nextNode();
    if (!node) return null;
    const range = document.createRange(); range.selectNodeContents(node);
    const rect = range.getClientRects()[0];
    return rect ? rect.top + rect.height / 2 : null;
  };
  const center = (el) => { const r = el.getBoundingClientRect(); return r.height ? r.top + r.height / 2 : null; };
  const out = [];
  for (const [name, rowSel, markSel, textSel, mode] of PAIRS) {
    for (const row of document.querySelectorAll(rowSel)) {
      if (!row.getClientRects().length) continue;
      const mark = row.querySelector(markSel), text = textSel === ":scope" ? row : row.querySelector(textSel);
      if (!mark || !text || mark === text) continue;
      const a = center(mark), b = mode === "block" ? center(text) : firstLine(text);
      if (a == null || b == null) continue;
      const off = Math.round((a - b) * 10) / 10;
      if (Math.abs(off) > 1) out.push({ name, off, text: (text.value || text.placeholder || text.textContent || "").trim().slice(0, 30) });
    }
  }
  console.table(out);
  return out;
})();
