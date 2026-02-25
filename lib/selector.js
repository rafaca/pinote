/**
 * Smart CSS selector generation.
 * Generates unique, stable, human-readable selectors.
 * Priority: #id > unique .class > [data-attr] > parent > .class > :nth-child
 */
const SelectorGenerator = (() => {

  function isUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function getTagName(el) {
    return el.tagName.toLowerCase();
  }

  function escapeCSS(str) {
    return CSS.escape ? CSS.escape(str) : str.replace(/([^\w-])/g, '\\$1');
  }

  function getIdSelector(el) {
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      const sel = '#' + escapeCSS(el.id);
      if (isUnique(sel)) return sel;
    }
    return null;
  }

  function getClassSelector(el) {
    const tag = getTagName(el);
    const classes = Array.from(el.classList).filter(c => /^[a-zA-Z][\w-]*$/.test(c));

    // Try single class
    for (const cls of classes) {
      const sel = tag + '.' + escapeCSS(cls);
      if (isUnique(sel)) return sel;
    }

    // Try class combo (max 3)
    if (classes.length >= 2) {
      for (let i = 0; i < classes.length; i++) {
        for (let j = i + 1; j < classes.length && j < i + 3; j++) {
          const sel = tag + '.' + escapeCSS(classes[i]) + '.' + escapeCSS(classes[j]);
          if (isUnique(sel)) return sel;
        }
      }
    }

    // Try just classes without tag
    for (const cls of classes) {
      const sel = '.' + escapeCSS(cls);
      if (isUnique(sel)) return sel;
    }

    return null;
  }

  function getDataAttrSelector(el) {
    const attrs = Array.from(el.attributes)
      .filter(a => a.name.startsWith('data-') && a.value)
      .slice(0, 5);

    for (const attr of attrs) {
      const sel = getTagName(el) + '[' + attr.name + '="' + attr.value.replace(/"/g, '\\"') + '"]';
      if (isUnique(sel)) return sel;
    }
    return null;
  }

  function getParentChildSelector(el) {
    const parent = el.parentElement;
    if (!parent || parent === document.body) return null;

    const tag = getTagName(el);
    const classes = Array.from(el.classList).filter(c => /^[a-zA-Z][\w-]*$/.test(c));

    // Try parent ID + child
    const parentSel = getIdSelector(parent) || getClassSelector(parent);
    if (parentSel) {
      // Try with tag + class
      for (const cls of classes) {
        const sel = parentSel + ' > ' + tag + '.' + escapeCSS(cls);
        if (isUnique(sel)) return sel;
      }
      // Try with just tag
      const sel = parentSel + ' > ' + tag;
      if (isUnique(sel)) return sel;
    }

    return null;
  }

  function getNthChildSelector(el) {
    const path = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      const parent = current.parentElement;
      if (!parent) break;

      const tag = getTagName(current);
      const classes = Array.from(current.classList).filter(c => /^[a-zA-Z][\w-]*$/.test(c));

      // Prefer class-based segment
      let segment = '';
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        segment = '#' + escapeCSS(current.id);
        path.unshift(segment);
        // ID is unique, stop going up
        const sel = path.join(' > ');
        if (isUnique(sel)) return sel;
        break;
      } else if (classes.length > 0) {
        segment = tag + '.' + escapeCSS(classes[0]);
        path.unshift(segment);
        const sel = path.join(' > ');
        if (isUnique(sel)) return sel;
      } else {
        // Use nth-child
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(current) + 1;
        segment = tag + ':nth-child(' + index + ')';
        path.unshift(segment);
        const sel = path.join(' > ');
        if (isUnique(sel)) return sel;
      }

      current = parent;
    }

    return path.length > 0 ? path.join(' > ') : null;
  }

  function generate(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return 'body';
    }

    return getIdSelector(el)
      || getClassSelector(el)
      || getDataAttrSelector(el)
      || getParentChildSelector(el)
      || getNthChildSelector(el)
      || getTagName(el);
  }

  function getFullPath(el) {
    const parts = [];
    let current = el;
    while (current && current !== document) {
      const tag = getTagName(current);
      const classes = Array.from(current.classList).filter(c => /^[a-zA-Z][\w-]*$/.test(c));
      let segment = tag;
      if (classes.length > 0) {
        segment += '.' + classes.slice(0, 2).join('.');
      } else {
        const parent = current.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (sameTag.length > 1) {
            segment += ':nth-child(' + (Array.from(parent.children).indexOf(current) + 1) + ')';
          }
        }
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  return { generate, getFullPath };
})();
