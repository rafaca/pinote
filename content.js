/**
 * PINOTE — Content Script
 * Handles annotation mode, element selection, comment popovers, and pin rendering.
 * All UI is rendered inside Shadow DOM for style isolation.
 */
(() => {
  let isActive = false;
  let annotations = [];
  let hoveredElement = null;
  let shadowHost = null;
  let shadowRoot = null;
  let currentPopover = null;
  let editingAnnotationId = null;

  // ─── Shadow DOM Setup ───────────────────────────────────────────

  function ensureShadowHost() {
    if (shadowHost) return shadowRoot;
    shadowHost = document.createElement('site-annotator-host');
    shadowHost.style.cssText = 'all:initial; position:absolute; top:0; left:0; z-index:2147483647; pointer-events:none;';
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `<style>${getShadowStyles()}</style><div id="sa-root"></div>`;
    return shadowRoot;
  }

  function getRoot() {
    ensureShadowHost();
    return shadowRoot.getElementById('sa-root');
  }

  function getShadowStyles() {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      #sa-root { position: relative; }

      .sa-banner {
        position: fixed; top: 0; left: 0; right: 0;
        background: #1a1a2e; color: #e0e0e0;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding: 8px 16px; text-align: center;
        z-index: 2147483647; pointer-events: auto;
        border-bottom: 2px solid #fced1e;
      }
      .sa-banner strong { color: #fced1e; }

      .sa-pin {
        position: absolute; pointer-events: auto; cursor: pointer;
        width: 24px; height: 24px; border-radius: 50%;
        background: #fced1e; color: #1a1a2e;
        font: bold 12px/24px -apple-system, sans-serif;
        text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        transition: transform 0.15s ease;
        user-select: none;
      }
      .sa-pin:hover { transform: scale(1.15); }

      .sa-tooltip {
        position: fixed; pointer-events: none;
        background: #1a1a2e; color: #a0a0b0;
        font: 11px/1.3 'SF Mono', Menlo, monospace;
        padding: 4px 8px; border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        white-space: nowrap; z-index: 2147483647;
      }

      .sa-popover {
        position: fixed; pointer-events: auto;
        background: #1a1a2e; color: #e0e0e0; border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        width: 320px; z-index: 2147483647;
        border: 1px solid #333;
      }
      .sa-popover-header {
        padding: 10px 14px 6px;
        font: 11px/1.3 'SF Mono', Menlo, monospace;
        color: #888; border-bottom: 1px solid #2a2a3e;
        word-break: break-all;
      }
      .sa-popover-body { padding: 10px 14px; }
      .sa-popover textarea {
        width: 100%; min-height: 70px; resize: vertical;
        background: #0d0d1a; color: #e0e0e0; border: 1px solid #444;
        border-radius: 4px; padding: 8px; font: inherit;
        outline: none;
      }
      .sa-popover textarea:focus { border-color: #fced1e; }
      .sa-popover-actions {
        display: flex; justify-content: flex-end; gap: 8px;
        padding: 8px 14px 12px;
      }
      .sa-btn {
        padding: 6px 14px; border-radius: 4px; border: none;
        font: 13px/1 -apple-system, sans-serif; cursor: pointer;
        pointer-events: auto;
      }
      .sa-btn-primary { background: #fced1e; color: #1a1a2e; font-weight: 600; }
      .sa-btn-primary:hover { background: #e0d600; }
      .sa-btn-secondary { background: #333; color: #ccc; }
      .sa-btn-secondary:hover { background: #444; }
      .sa-btn-danger { background: #dc2626; color: #fff; }
      .sa-btn-danger:hover { background: #b91c1c; }
    `;
  }

  // ─── Banner ─────────────────────────────────────────────────────

  function showBanner() {
    const root = getRoot();
    let banner = shadowRoot.querySelector('.sa-banner');
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'sa-banner';
    banner.innerHTML = '<strong>PINOTE</strong> — Click any element to annotate. Press <strong>Esc</strong> to exit.';
    root.appendChild(banner);
  }

  function hideBanner() {
    const banner = shadowRoot?.querySelector('.sa-banner');
    if (banner) banner.remove();
  }

  // ─── Tooltip ────────────────────────────────────────────────────

  let tooltipEl = null;

  function showTooltip(el, x, y) {
    if (!shadowRoot) return;
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'sa-tooltip';
      getRoot().appendChild(tooltipEl);
    }
    const tag = el.tagName.toLowerCase();
    const cls = el.classList.length > 0 ? '.' + Array.from(el.classList).slice(0, 2).join('.') : '';
    tooltipEl.textContent = `<${tag}${cls}>`;
    tooltipEl.style.left = (x + 12) + 'px';
    tooltipEl.style.top = (y + 12) + 'px';
    tooltipEl.style.display = 'block';
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  // ─── Pins ───────────────────────────────────────────────────────

  function renderPins() {
    if (!shadowRoot) return;
    // Remove existing pins
    shadowRoot.querySelectorAll('.sa-pin').forEach(p => p.remove());

    annotations.forEach((ann, i) => {
      const match = ElementMatcher.findElement(ann);
      if (!match.element) return;

      const rect = match.element.getBoundingClientRect();
      const pin = document.createElement('div');
      pin.className = 'sa-pin';
      pin.textContent = String(i + 1);
      pin.style.left = (window.scrollX + rect.right - 12) + 'px';
      pin.style.top = (window.scrollY + rect.top - 12) + 'px';
      pin.dataset.annId = ann.id;

      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        openPopoverForAnnotation(ann, match.element);
      });

      getRoot().appendChild(pin);
    });
  }

  function updatePinPositions() {
    if (!shadowRoot) return;
    const pins = shadowRoot.querySelectorAll('.sa-pin');
    pins.forEach(pin => {
      const ann = annotations.find(a => a.id === pin.dataset.annId);
      if (!ann) return;
      const match = ElementMatcher.findElement(ann);
      if (!match.element) return;
      const rect = match.element.getBoundingClientRect();
      pin.style.left = (window.scrollX + rect.right - 12) + 'px';
      pin.style.top = (window.scrollY + rect.top - 12) + 'px';
    });
  }

  // ─── Popover ────────────────────────────────────────────────────

  function closePopover() {
    if (currentPopover) {
      currentPopover.remove();
      currentPopover = null;
    }
    editingAnnotationId = null;
    // Remove highlight from any highlighted element
    document.querySelectorAll('[data-sa-highlighted]').forEach(el => {
      el.style.outline = el.dataset.saOldOutline || '';
      delete el.dataset.saHighlighted;
      delete el.dataset.saOldOutline;
    });
  }

  function highlightElement(el) {
    el.dataset.saOldOutline = el.style.outline;
    el.dataset.saHighlighted = 'true';
    el.style.outline = '2px solid #fced1e';
  }

  function openPopover(el, existingAnnotation) {
    closePopover();
    highlightElement(el);

    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).join(' ');
    const label = `<${tag}>${classes ? '.' + classes.replace(/ /g, '.') : ''}`;

    const popover = document.createElement('div');
    popover.className = 'sa-popover';

    // Position: prefer below, fallback above
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;
    if (rect.bottom + 200 > window.innerHeight) {
      top = rect.top + window.scrollY - 200;
    }
    left = Math.max(10, Math.min(left, window.innerWidth - 340));

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.style.position = 'absolute';

    const comment = existingAnnotation ? existingAnnotation.comment : '';
    editingAnnotationId = existingAnnotation ? existingAnnotation.id : null;

    popover.innerHTML = `
      <div class="sa-popover-header">${escapeHtml(label)}</div>
      <div class="sa-popover-body">
        <textarea placeholder="Enter your dev instruction...">${escapeHtml(comment)}</textarea>
      </div>
      <div class="sa-popover-actions">
        ${existingAnnotation ? '<button class="sa-btn sa-btn-danger" data-action="delete">Delete</button>' : ''}
        <button class="sa-btn sa-btn-secondary" data-action="cancel">Cancel</button>
        <button class="sa-btn sa-btn-primary" data-action="save">Save</button>
      </div>
    `;

    getRoot().appendChild(popover);
    currentPopover = popover;

    // Focus textarea
    const textarea = popover.querySelector('textarea');
    setTimeout(() => textarea.focus(), 50);

    // Handle keyboard in textarea
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveCurrentAnnotation(el, textarea.value);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
      }
      e.stopPropagation();
    });

    // Button handlers
    popover.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = e.target.dataset?.action;
      if (action === 'save') {
        saveCurrentAnnotation(el, textarea.value);
      } else if (action === 'cancel') {
        closePopover();
      } else if (action === 'delete') {
        deleteCurrentAnnotation();
      }
    });
  }

  function openPopoverForAnnotation(annotation, el) {
    openPopover(el, annotation);
  }

  async function saveCurrentAnnotation(el, comment) {
    if (!comment.trim()) {
      closePopover();
      return;
    }

    const selector = SelectorGenerator.generate(el);
    const elementPath = SelectorGenerator.getFullPath(el);
    const computedStyles = StyleExtractor.extract(el);
    const boundingBox = StyleExtractor.getBoundingBox(el);
    const textContent = (el.textContent || '').trim().slice(0, 200);
    const classes = Array.from(el.classList);
    const tagName = el.tagName.toLowerCase();

    const annotation = {
      id: editingAnnotationId || undefined,
      selector,
      elementPath,
      tagName,
      textContent,
      classes,
      boundingBox,
      computedStyles,
      comment: comment.trim()
    };

    const saved = await AnnotationStorage.saveAnnotation(window.location.href, annotation);

    // Update local state
    const idx = annotations.findIndex(a => a.id === saved.id);
    if (idx >= 0) {
      annotations[idx] = saved;
    } else {
      annotations.push(saved);
    }

    closePopover();
    renderPins();
    notifySidepanel();
  }

  async function deleteCurrentAnnotation() {
    if (!editingAnnotationId) return;
    await AnnotationStorage.deleteAnnotation(window.location.href, editingAnnotationId);
    annotations = annotations.filter(a => a.id !== editingAnnotationId);
    closePopover();
    renderPins();
    notifySidepanel();
  }

  // ─── Event Handlers ─────────────────────────────────────────────

  function onMouseMove(e) {
    if (!isActive || currentPopover) return;

    // Ignore our own UI
    if (e.target.closest?.('site-annotator-host')) return;

    const el = e.target;
    if (el === hoveredElement) return;

    // Remove old hover
    if (hoveredElement) {
      hoveredElement.classList.remove('sa-hover-highlight');
    }

    hoveredElement = el;
    el.classList.add('sa-hover-highlight');
    showTooltip(el, e.clientX, e.clientY);
  }

  function onMouseLeave() {
    if (hoveredElement) {
      hoveredElement.classList.remove('sa-hover-highlight');
      hoveredElement = null;
    }
    hideTooltip();
  }

  function onClick(e) {
    if (!isActive) return;

    // Ignore clicks on our UI
    if (e.target.closest?.('site-annotator-host')) return;

    e.preventDefault();
    e.stopPropagation();

    const el = e.target;

    // Check if there's an existing annotation for this element
    const existing = annotations.find(ann => {
      const match = ElementMatcher.findElement(ann);
      return match.element === el;
    });

    openPopover(el, existing);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (currentPopover) {
        closePopover();
      } else if (isActive) {
        deactivate();
        chrome.runtime.sendMessage({ type: 'annotationModeChanged', active: false });
      }
    }
  }

  function onScroll() {
    if (isActive) updatePinPositions();
  }

  // ─── Activate / Deactivate ──────────────────────────────────────

  async function activate() {
    if (isActive) return;
    isActive = true;

    ensureShadowHost();
    showBanner();

    // Load annotations for this page
    const data = await AnnotationStorage.getForUrl(window.location.href);
    annotations = data.annotations || [];
    renderPins();

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseleave', onMouseLeave, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePinPositions);

    document.body.classList.add('sa-active');
  }

  function deactivate() {
    if (!isActive) return;
    isActive = false;

    closePopover();
    hideBanner();
    hideTooltip();

    if (hoveredElement) {
      hoveredElement.classList.remove('sa-hover-highlight');
      hoveredElement = null;
    }

    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseleave', onMouseLeave, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', updatePinPositions);

    document.body.classList.remove('sa-active');

    // Remove pins
    shadowRoot?.querySelectorAll('.sa-pin').forEach(p => p.remove());
  }

  // ─── Messaging ──────────────────────────────────────────────────

  function notifySidepanel() {
    chrome.runtime.sendMessage({
      type: 'annotationsUpdated',
      url: window.location.href,
      annotations,
      count: annotations.length
    }).catch(() => { /* sidepanel may not be open */ });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggleAnnotationMode') {
      if (isActive) {
        deactivate();
      } else {
        activate();
      }
      sendResponse({ active: isActive });
      return;
    }

    if (msg.type === 'activateAnnotationMode') {
      if (!isActive) {
        activate();
      }
      sendResponse({ active: isActive });
      return;
    }

    if (msg.type === 'getState') {
      sendResponse({
        active: isActive,
        url: window.location.href,
        annotations,
        count: annotations.length
      });
      return;
    }

    if (msg.type === 'jumpToAnnotation') {
      const ann = annotations.find(a => a.id === msg.annotationId);
      if (ann) {
        const match = ElementMatcher.findElement(ann);
        if (match.element) {
          match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Flash highlight
          match.element.style.outline = '3px solid #fced1e';
          setTimeout(() => {
            match.element.style.outline = '';
          }, 2000);
        }
      }
      return;
    }

    if (msg.type === 'deleteAnnotation') {
      AnnotationStorage.deleteAnnotation(window.location.href, msg.annotationId).then(() => {
        annotations = annotations.filter(a => a.id !== msg.annotationId);
        renderPins();
        notifySidepanel();
      });
      return;
    }

    if (msg.type === 'clearAnnotations') {
      AnnotationStorage.clearForUrl(window.location.href).then(() => {
        annotations = [];
        renderPins();
        notifySidepanel();
      });
      return;
    }

    if (msg.type === 'getArticleText') {
      // Extract main article text from the page
      const article = document.querySelector('article')
        || document.querySelector('[role="main"]')
        || document.querySelector('.post-content, .article-content, .entry-content, .story-body, main');
      const source = article || document.body;
      const title = document.querySelector('h1')?.textContent?.trim()
        || document.title
        || '';
      // Get clean text: skip scripts, styles, nav, footer
      const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (['SCRIPT', 'STYLE', 'NAV', 'FOOTER', 'HEADER', 'ASIDE', 'NOSCRIPT'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('nav, footer, header, aside, [role="navigation"], [role="banner"]')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const parts = [];
      while (walker.nextNode()) {
        parts.push(walker.currentNode.textContent.trim());
      }
      const text = parts.join(' ').replace(/\s+/g, ' ').trim();
      sendResponse({ text, title });
      return;
    }

    if (msg.type === 'exportMarkdown') {
      const md = Exporter.exportMarkdown(window.location.href, annotations);
      sendResponse({ markdown: md });
      return;
    }

    if (msg.type === 'exportJSON') {
      const json = Exporter.exportJSON(window.location.href, annotations);
      sendResponse({ json });
      return;
    }

    if (msg.type === 'exportAllMarkdown') {
      AnnotationStorage.getAll().then(all => {
        const md = Exporter.exportAllPagesMarkdown(all);
        sendResponse({ markdown: md });
      });
      return true; // async
    }

    if (msg.type === 'exportAllJSON') {
      AnnotationStorage.getAll().then(all => {
        const json = Exporter.exportAllPagesJSON(all);
        sendResponse({ json });
      });
      return true; // async
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Auto-load pins on page load (without activating annotation mode) ───

  (async () => {
    const data = await AnnotationStorage.getForUrl(window.location.href);
    if (data.annotations && data.annotations.length > 0) {
      annotations = data.annotations;
      // Don't render pins until annotation mode is activated
      // They'll be rendered when activate() is called
    }
  })();

})();
