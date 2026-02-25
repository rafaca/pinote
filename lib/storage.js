/**
 * Chrome storage wrapper for annotation persistence.
 * Annotations are keyed by normalized URL.
 */
const AnnotationStorage = (() => {

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Keep protocol + host + pathname, strip trailing slash
      let normalized = u.origin + u.pathname.replace(/\/+$/, '');
      return normalized || u.origin;
    } catch {
      return url;
    }
  }

  function generateId() {
    return 'ann_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  async function getAll() {
    const data = await chrome.storage.local.get('annotations');
    return data.annotations || {};
  }

  async function getForUrl(url) {
    const all = await getAll();
    const key = normalizeUrl(url);
    return all[key] || { pageTitle: document.title, annotations: [] };
  }

  async function saveAnnotation(url, annotation) {
    const all = await getAll();
    const key = normalizeUrl(url);

    if (!all[key]) {
      all[key] = { pageTitle: document.title, annotations: [] };
    }

    annotation.id = annotation.id || generateId();
    annotation.createdAt = annotation.createdAt || new Date().toISOString();
    annotation.updatedAt = new Date().toISOString();

    // Check if updating existing
    const idx = all[key].annotations.findIndex(a => a.id === annotation.id);
    if (idx >= 0) {
      all[key].annotations[idx] = { ...all[key].annotations[idx], ...annotation };
    } else {
      all[key].annotations.push(annotation);
    }

    all[key].pageTitle = document.title;
    await chrome.storage.local.set({ annotations: all });
    scheduleBackup();
    return annotation;
  }

  async function deleteAnnotation(url, annotationId) {
    const all = await getAll();
    const key = normalizeUrl(url);

    if (all[key]) {
      all[key].annotations = all[key].annotations.filter(a => a.id !== annotationId);
      if (all[key].annotations.length === 0) {
        delete all[key];
      }
      await chrome.storage.local.set({ annotations: all });
      scheduleBackup();
    }
  }

  async function clearForUrl(url) {
    const all = await getAll();
    const key = normalizeUrl(url);
    delete all[key];
    await chrome.storage.local.set({ annotations: all });
  }

  async function clearAll() {
    await chrome.storage.local.set({ annotations: {} });
  }

  async function getAllUrls() {
    const all = await getAll();
    return Object.entries(all).map(([url, data]) => ({
      url,
      pageTitle: data.pageTitle,
      count: data.annotations.length
    }));
  }

  // ─── Auto-backup ───────────────────────────────────────────

  let backupTimer = null;

  function scheduleBackup() {
    // Debounce: backup 2s after last change
    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(performBackup, 2000);
  }

  async function performBackup() {
    try {
      const all = await getAll();
      const totalAnnotations = Object.values(all).reduce(
        (sum, page) => sum + page.annotations.length, 0
      );
      if (totalAnnotations === 0) return;

      const json = JSON.stringify({ _pinoteBackup: true, timestamp: new Date().toISOString(), annotations: all }, null, 2);
      // Route through background script which has chrome.downloads access
      chrome.runtime.sendMessage({ type: 'autoBackup', json });
    } catch (e) {
      console.warn('PINOTE: auto-backup failed', e);
    }
  }

  async function importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data._pinoteBackup || !data._newsflashBackup || !data.annotations) {
        throw new Error('Not a valid PINOTE backup file');
      }
      // Merge: imported data fills in, existing data takes priority
      const existing = await getAll();
      const merged = { ...data.annotations };
      // Overlay existing on top so we don't lose current work
      for (const [key, val] of Object.entries(existing)) {
        if (!merged[key]) {
          merged[key] = val;
        } else {
          // Merge annotations by id
          const existingIds = new Set(val.annotations.map(a => a.id));
          const combined = [...val.annotations];
          for (const ann of merged[key].annotations) {
            if (!existingIds.has(ann.id)) combined.push(ann);
          }
          merged[key] = { ...merged[key], ...val, annotations: combined };
        }
      }
      await chrome.storage.local.set({ annotations: merged });
      return { success: true, pages: Object.keys(merged).length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    normalizeUrl,
    generateId,
    getAll,
    getForUrl,
    saveAnnotation,
    deleteAnnotation,
    clearForUrl,
    clearAll,
    getAllUrls,
    importBackup
  };
})();
