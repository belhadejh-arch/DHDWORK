/*
 * DHD Livraison — responsive table semantics.
 *
 * The imported admin pages are delivered as lazy-loaded bundles.  This layer
 * only copies the translated header text to each cell as a data attribute so
 * the mobile stylesheet can present the same records as labelled cards.
 * It does not change data, navigation, or event handlers.
 */
(function () {
  function enhanceTable(table) {
    if (!(table instanceof HTMLTableElement)) return;

    const headerRow = table.tHead && table.tHead.rows[0];
    const headers = headerRow
      ? Array.from(headerRow.cells).map(function (cell) {
          return (cell.textContent || '').replace(/\s+/g, ' ').trim();
        })
      : [];

    if (!headers.length) return;

    table.setAttribute('data-responsive-table', 'true');
    Array.from(table.tBodies).forEach(function (body) {
      Array.from(body.rows).forEach(function (row) {
        Array.from(row.cells).forEach(function (cell, index) {
          if (cell.hasAttribute('colspan')) return;
          const label = headers[index];
          if (label) cell.setAttribute('data-label', label);
        });
      });
    });
  }

  function scan(root) {
    if (!root) return;
    if (root instanceof HTMLTableElement) enhanceTable(root);
    if (root.querySelectorAll) {
      root.querySelectorAll('table').forEach(enhanceTable);
    }
  }

  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
})();