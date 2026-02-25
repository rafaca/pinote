/**
 * Element re-matching logic for annotation persistence.
 * When revisiting a page, elements may have shifted.
 * Uses a scoring system to find the best match.
 */
const ElementMatcher = (() => {

  function matchBySelector(annotation) {
    try {
      const el = document.querySelector(annotation.selector);
      if (el) return { element: el, confidence: 'exact' };
    } catch { /* invalid selector */ }
    return null;
  }

  function matchByTextAndTag(annotation) {
    if (!annotation.textContent || !annotation.tagName) return null;

    const candidates = document.querySelectorAll(annotation.tagName);
    const targetText = annotation.textContent.trim().toLowerCase();

    for (const el of candidates) {
      const elText = (el.textContent || '').trim().toLowerCase();
      // Exact text match
      if (elText === targetText) {
        return { element: el, confidence: 'text-match' };
      }
      // Partial match (first 50 chars)
      if (targetText.length > 10 && elText.startsWith(targetText.slice(0, 50))) {
        return { element: el, confidence: 'text-partial' };
      }
    }
    return null;
  }

  function matchByPosition(annotation) {
    if (!annotation.boundingBox) return null;

    const { x, y, width, height } = annotation.boundingBox;
    const tag = annotation.tagName || '*';
    const candidates = document.querySelectorAll(tag);
    const threshold = 50; // px tolerance

    let bestMatch = null;
    let bestDist = Infinity;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const dx = Math.abs(rect.x - x);
      const dy = Math.abs(rect.y - y);
      const dw = Math.abs(rect.width - width);
      const dh = Math.abs(rect.height - height);
      const dist = dx + dy + dw * 0.5 + dh * 0.5;

      if (dx < threshold && dy < threshold && dist < bestDist) {
        bestDist = dist;
        bestMatch = el;
      }
    }

    if (bestMatch) {
      return { element: bestMatch, confidence: 'position' };
    }
    return null;
  }

  function matchByClasses(annotation) {
    if (!annotation.classes || annotation.classes.length === 0) return null;

    const tag = annotation.tagName || '*';
    // Try matching by the first class
    for (const cls of annotation.classes) {
      try {
        const candidates = document.querySelectorAll(tag + '.' + CSS.escape(cls));
        if (candidates.length === 1) {
          return { element: candidates[0], confidence: 'class-match' };
        }
      } catch { /* skip invalid class names */ }
    }
    return null;
  }

  /**
   * Attempt to find the DOM element for a stored annotation.
   * Returns { element, confidence } or { element: null, confidence: 'orphaned' }
   */
  function findElement(annotation) {
    // Try strategies in priority order
    return matchBySelector(annotation)
      || matchByTextAndTag(annotation)
      || matchByClasses(annotation)
      || matchByPosition(annotation)
      || { element: null, confidence: 'orphaned' };
  }

  return { findElement };
})();
