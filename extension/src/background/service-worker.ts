/**
 * Background service worker.
 *
 * Clicking the toolbar icon (or pressing the shortcut) opens the side panel. That click also gives
 * the extension temporary access to the current tab (the activeTab permission), so we tell an
 * already-open panel to re-read the page.
 */
import { ACCESS_GRANTED } from '../shared/constants';

chrome.runtime.onInstalled.addListener(() => {
  // We open the panel ourselves so the click still fires action.onClicked (and grants activeTab).
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});

chrome.action.onClicked.addListener((tab) => {
  // sidePanel.open must be called synchronously inside the user gesture.
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
  if (tab.id !== undefined) {
    chrome.runtime.sendMessage({ type: ACCESS_GRANTED, tabId: tab.id }).catch(() => {
      // No panel is listening yet; it will read the page when it loads.
    });
  }
});
