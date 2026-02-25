/**
 * PINOTE — Side Panel
 * Lists annotations, handles export, communicates with content script.
 */

const pageUrlEl = document.getElementById('pageUrl');
const countEl = document.getElementById('annotationCount');
const listEl = document.getElementById('annotationList');
const emptyEl = document.getElementById('emptyState');
const toastEl = document.getElementById('toast');
const exportMdBtn = document.getElementById('exportMd');
const clearAllBtn = document.getElementById('clearAll');

let currentAnnotations = [];
let currentUrl = '';

// ─── Helpers ──────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  setTimeout(() => toastEl.classList.remove('visible'), 2000);
}

async function sendToContent(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'forwardToContent', message }, (response) => {
      resolve(response);
    });
  });
}

// ─── Render ───────────────────────────────────────────────────

function render() {
  const count = currentAnnotations.length;
  countEl.textContent = count + ' annotation' + (count !== 1 ? 's' : '');

  // Toggle button states
  const hasAnnotations = count > 0;
  exportMdBtn.disabled = !hasAnnotations;
  clearAllBtn.disabled = !hasAnnotations;

  // Clear list (keep empty state)
  listEl.querySelectorAll('.sp-item').forEach(el => el.remove());

  if (count === 0) {
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  currentAnnotations.forEach((ann, i) => {
    const item = document.createElement('div');
    item.className = 'sp-item';

    const tag = ann.tagName || '?';
    const selector = ann.selector || '';
    const selectorDisplay = selector.length > 40 ? selector.slice(0, 40) + '...' : selector;

    let html = `
      <div class="sp-item-header">
        <div class="sp-item-pin">${i + 1}</div>
        <div class="sp-item-selector" title="${escapeHtml(selector)}">&lt;${escapeHtml(tag)}&gt; ${escapeHtml(selectorDisplay)}</div>
      </div>
      <div class="sp-item-comment">${escapeHtml(ann.comment || '')}</div>
      <div class="sp-item-actions">
        <button class="sp-item-btn" data-action="jump" data-id="${ann.id}">Jump to</button>
        <button class="sp-item-btn danger" data-action="delete" data-id="${ann.id}">Delete</button>
      </div>
    `;

    item.innerHTML = html;
    listEl.appendChild(item);
  });
}

// ─── Load State ───────────────────────────────────────────────

async function loadState() {
  try {
    const state = await sendToContent({ type: 'getState' });
    if (state) {
      currentUrl = state.url || '';
      currentAnnotations = state.annotations || [];
      pageUrlEl.textContent = currentUrl ? new URL(currentUrl).hostname + new URL(currentUrl).pathname : 'No page active';
      render();
    }
  } catch {
    pageUrlEl.textContent = 'Unable to connect to page';
  }
}

// ─── Event Handlers ───────────────────────────────────────────

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'jump') {
    sendToContent({ type: 'jumpToAnnotation', annotationId: id });
  } else if (action === 'delete') {
    sendToContent({ type: 'deleteAnnotation', annotationId: id });
    currentAnnotations = currentAnnotations.filter(a => a.id !== id);
    render();
  }
});

exportMdBtn.addEventListener('click', async () => {
  const result = await sendToContent({ type: 'exportMarkdown' });
  if (result?.markdown) {
    await navigator.clipboard.writeText(result.markdown);
    showToast('Markdown copied to clipboard!');
  }
});

clearAllBtn.addEventListener('click', async () => {
  if (currentAnnotations.length === 0) return;
  sendToContent({ type: 'clearAnnotations' });
  currentAnnotations = [];
  render();
  showToast('Annotations cleared');
});


// ─── Listen for updates from content script ───────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'annotationsUpdated') {
    currentAnnotations = msg.annotations || [];
    currentUrl = msg.url || currentUrl;
    render();
  }
});

// ─── Refresh when tab changes ─────────────────────────────────

chrome.tabs.onActivated?.addListener(() => {
  setTimeout(loadState, 200);
});

chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    setTimeout(loadState, 300);
  }
});



// ─── Init ─────────────────────────────────────────────────────

loadState();

// Auto-activate annotation mode when panel opens
setTimeout(() => {
  chrome.runtime.sendMessage({ type: 'activateAnnotationMode' }).catch(() => {});
}, 300);
