/**
 * Computed style extraction for annotated elements.
 */
const StyleExtractor = (() => {

  const KEY_PROPERTIES = [
    'fontSize',
    'fontFamily',
    'fontWeight',
    'color',
    'backgroundColor',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'display',
    'position',
    'borderRadius',
    'boxShadow',
    'lineHeight',
    'textAlign',
    'textDecoration',
    'width',
    'height',
    'maxWidth',
    'gap',
    'flexDirection',
    'justifyContent',
    'alignItems'
  ];

  // Shorthand properties we want to collapse
  const SHORTHANDS = {
    padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']
  };

  function rgbToHex(rgb) {
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb;
    const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  function extract(el) {
    const computed = window.getComputedStyle(el);
    const raw = {};

    for (const prop of KEY_PROPERTIES) {
      const val = computed[prop];
      if (val && val !== '' && val !== 'none' && val !== 'normal' && val !== 'auto') {
        raw[prop] = val;
      }
    }

    // Collapse shorthand padding/margin
    const result = {};
    const consumed = new Set();

    for (const [shorthand, parts] of Object.entries(SHORTHANDS)) {
      const values = parts.map(p => raw[p]).filter(Boolean);
      if (values.length === 4) {
        // All four sides present — use shorthand
        const [top, right, bottom, left] = values;
        if (top === right && right === bottom && bottom === left) {
          result[shorthand] = top;
        } else if (top === bottom && right === left) {
          result[shorthand] = top + ' ' + right;
        } else {
          result[shorthand] = values.join(' ');
        }
        parts.forEach(p => consumed.add(p));
      }
    }

    for (const [prop, val] of Object.entries(raw)) {
      if (consumed.has(prop)) continue;

      // Convert rgb colors to hex
      if (prop === 'color' || prop === 'backgroundColor') {
        result[prop] = rgbToHex(val);
      } else {
        result[prop] = val;
      }
    }

    // Remove defaults that aren't useful
    if (result.display === 'block' || result.display === 'inline') {
      // Keep these, they're informative
    }
    if (result.position === 'static') {
      delete result.position;
    }

    return result;
  }

  function getBoundingBox(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  return { extract, getBoundingBox };
})();
