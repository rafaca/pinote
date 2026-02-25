/**
 * PINOTE — Background Service Worker
 * Handles badge updates, messaging, and side panel.
 *
 * Pattern: no "side_panel" in manifest. Register at runtime via setOptions,
 * then open programmatically on action click (same as Claude extension).
 */

// Track active state per tab
const tabStates = {};

// ─── Side Panel — register at runtime ───────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(() => {});

// ─── Icon Click → Open Side Panel ───────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  if (!tabId) return;
  chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
  chrome.sidePanel.open({ tabId });
});

// ─── Badge ────────────────────────────────────────────────────

function updateBadge(tabId) {
  const active = tabStates[tabId];
  chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#fced1e' });
}

// ─── Message Router ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'annotationsUpdated') {
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'annotationModeChanged') {
    if (sender.tab?.id) {
      tabStates[sender.tab.id] = msg.active;
      updateBadge(sender.tab.id);
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) sendResponse({ tabId: tabs[0].id, url: tabs[0].url });
    });
    return true;
  }

  if (msg.type === 'forwardToContent') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg.message, (response) => {
          sendResponse(response);
        });
      }
    });
    return true;
  }

  if (msg.type === 'activateAnnotationMode') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'activateAnnotationMode' }, (response) => {
          if (response?.active) {
            tabStates[tabs[0].id] = true;
            updateBadge(tabs[0].id);
          }
          sendResponse(response);
        });
      }
    });
    return true;
  }

  // Auto-backup annotations to Downloads
  if (msg.type === 'autoBackup') {
    const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(msg.json)));
    chrome.downloads.download({
      url: dataUrl,
      filename: 'pinote-backup.json',
      conflictAction: 'overwrite',
      saveAs: false
    });
    sendResponse({ ok: true });
    return;
  }

  // Save annotation markdown to Desktop as annotations.md
  if (msg.type === 'saveAnnotationFile') {
    const dataUrl = 'data:text/markdown;base64,' + btoa(unescape(encodeURIComponent(msg.markdown)));
    chrome.downloads.download({
      url: dataUrl,
      filename: 'annotations.md',
      conflictAction: 'overwrite',
      saveAs: false
    }, (downloadId) => {
      sendResponse({ success: !!downloadId });
    });
    return true;
  }
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStates[tabId];
});

// Update badge when tab changes
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateBadge(tabId);
});
