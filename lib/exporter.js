/**
 * Markdown and JSON export formatting.
 * Output format matches the Agentation-compatible schema from the spec.
 */
const Exporter = (() => {

  function camelToKebab(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  function formatStylesMarkdown(styles) {
    if (!styles || Object.keys(styles).length === 0) return '';
    const lines = Object.entries(styles).map(([prop, val]) => {
      return '  - ' + camelToKebab(prop) + ': ' + val;
    });
    return lines.join('\n');
  }

  function annotationToMarkdown(annotation, index) {
    const num = index + 1;
    const tag = annotation.tagName || 'unknown';
    const text = annotation.textContent
      ? ' — "' + annotation.textContent.slice(0, 60) + (annotation.textContent.length > 60 ? '...' : '') + '"'
      : '';
    const classes = (annotation.classes || []).join(' ');
    const box = annotation.boundingBox || {};
    const styles = formatStylesMarkdown(annotation.computedStyles);

    let md = `## Annotation ${num}\n\n`;
    md += `- **Element:** \`<${tag}>\`${text}\n`;
    md += `- **Selector:** \`${annotation.selector || 'unknown'}\`\n`;

    if (classes) {
      md += `- **Classes:** \`${classes}\`\n`;
    }

    if (box.x !== undefined) {
      md += `- **Position:** x: ${box.x}px, y: ${box.y}px (viewport)\n`;
      md += `- **Bounding Box:** ${box.width}×${box.height}px\n`;
    }

    if (styles) {
      md += `- **Current Styles:**\n${styles}\n`;
    }

    md += `- **Instruction:** "${annotation.comment || ''}"\n`;

    return md;
  }

  function exportMarkdown(url, annotations) {
    const date = new Date().toISOString();
    let md = `# Site Feedback\n\n`;
    md += `**URL:** ${url}\n`;
    md += `**Date:** ${date}\n`;
    md += `**Annotations:** ${annotations.length}\n\n`;
    md += `---\n\n`;

    annotations.forEach((ann, i) => {
      md += annotationToMarkdown(ann, i);
      if (i < annotations.length - 1) {
        md += `\n---\n\n`;
      }
    });

    return md;
  }

  function exportAllPagesMarkdown(allData) {
    const date = new Date().toISOString();
    let md = `# Site Feedback — All Pages\n\n`;
    md += `**Date:** ${date}\n`;

    const urls = Object.keys(allData);
    let totalCount = 0;
    urls.forEach(url => { totalCount += allData[url].annotations.length; });
    md += `**Total Annotations:** ${totalCount} across ${urls.length} page(s)\n\n`;
    md += `---\n\n`;

    urls.forEach(url => {
      const page = allData[url];
      md += `# ${page.pageTitle || url}\n\n`;
      md += `**URL:** ${url}\n`;
      md += `**Annotations:** ${page.annotations.length}\n\n`;

      page.annotations.forEach((ann, i) => {
        md += annotationToMarkdown(ann, i);
        if (i < page.annotations.length - 1) {
          md += `\n---\n\n`;
        }
      });

      md += `\n---\n\n`;
    });

    return md;
  }

  function exportJSON(url, annotations) {
    return JSON.stringify({
      url,
      timestamp: new Date().toISOString(),
      annotations: annotations.map(ann => ({
        id: ann.id,
        element: ann.tagName,
        textContent: ann.textContent || '',
        selector: ann.selector,
        elementPath: ann.elementPath || '',
        classes: ann.classes || [],
        boundingBox: ann.boundingBox || {},
        computedStyles: ann.computedStyles || {},
        comment: ann.comment || '',
        timestamp: ann.createdAt || new Date().toISOString()
      }))
    }, null, 2);
  }

  function exportAllPagesJSON(allData) {
    const pages = Object.entries(allData).map(([url, page]) => ({
      url,
      pageTitle: page.pageTitle,
      annotations: page.annotations.map(ann => ({
        id: ann.id,
        element: ann.tagName,
        textContent: ann.textContent || '',
        selector: ann.selector,
        elementPath: ann.elementPath || '',
        classes: ann.classes || [],
        boundingBox: ann.boundingBox || {},
        computedStyles: ann.computedStyles || {},
        comment: ann.comment || '',
        timestamp: ann.createdAt || new Date().toISOString()
      }))
    }));

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      totalAnnotations: pages.reduce((sum, p) => sum + p.annotations.length, 0),
      pages
    }, null, 2);
  }

  return {
    exportMarkdown,
    exportAllPagesMarkdown,
    exportJSON,
    exportAllPagesJSON
  };
})();
