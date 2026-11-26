/**
 * Background event page: toolbar shortcuts, context menu and on-demand
 * content-script injection for tabs that were already open when the
 * extension was installed or reloaded.
 */
"use strict";
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const CONTENT_FILES = [
    "shared/profile.js",
    "content/labels.js",
    "content/rules.js",
    "content/filler.js",
    "content/picker.js",
    "content/content.js"
  ];

  const MENU_FILL = "ja-fill-page";
  const MENU_PICK = "ja-pick-field";
  const MENU_OPTIONS = "ja-open-options";

  const createMenus = async () => {
    try {
      await api.contextMenus.removeAll();
    } catch (_) {
      /* ignore */
    }
    const create = (options) => {
      try {
        api.contextMenus.create(options, () => void api.runtime.lastError);
      } catch (_) {
        /* ignore */
      }
    };
    create({
      id: MENU_FILL,
      title: "Fill this page with Job Autofill",
      contexts: ["page", "editable"]
    });
    create({
      id: MENU_PICK,
      title: "Pick a field and choose a saved value",
      contexts: ["page", "editable"]
    });
    create({ id: "separator", type: "separator", contexts: ["page", "editable"] });
    create({
      id: MENU_OPTIONS,
      title: "Edit career profile…",
      contexts: ["page", "editable"]
    });
  };

  api.runtime.onInstalled.addListener(async (details) => {
    await createMenus();
    if (details.reason === "install") {
      try {
        const profile = await window.JAProfile.load();
        if (window.JAProfile.isProfileEmpty(profile)) api.runtime.openOptionsPage();
      } catch (_) {
        api.runtime.openOptionsPage();
      }
    }
  });

  api.runtime.onStartup?.addListener(() => {
    createMenus();
  });

  const injectContentScript = async (tabId) => {
    await api.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES
    });
  };

  const sendToTab = async (tabId, message, options) => {
    try {
      return await api.tabs.sendMessage(tabId, message, options);
    } catch (firstError) {
      await injectContentScript(tabId);
      // Give the newly injected listener a tick to register.
      await new Promise((resolve) => setTimeout(resolve, 80));
      return api.tabs.sendMessage(tabId, message, options);
    }
  };

  const activeTab = async () => {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  };

  const fillActivePage = async () => {
    const tab = await activeTab();
    if (!tab || !tab.id) return;
    try {
      const response = await sendToTab(tab.id, { type: "FILL_ALL" });
      if (response && response.ok && response.summary) {
        console.info(
          `[Job Autofill] Filled ${response.summary.filled} field(s), skipped ${response.summary.skipped}.`
        );
      } else if (response && response.error) {
        console.warn("[Job Autofill]", response.error);
      }
    } catch (error) {
      console.warn("[Job Autofill] Could not fill this page", error);
    }
  };

  const openPicker = async () => {
    const tab = await activeTab();
    if (!tab || !tab.id) return;
    try {
      const response = await sendToTab(tab.id, { type: "START_PICK" }, { frameId: 0 });
      if (response && response.error) console.warn("[Job Autofill]", response.error);
    } catch (error) {
      console.warn("[Job Autofill] Could not open the picker", error);
    }
  };

  api.commands.onCommand.addListener((command) => {
    if (command === "fill-page") fillActivePage();
    else if (command === "pick-field") openPicker();
  });

  api.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === MENU_FILL) fillActivePage();
    else if (info.menuItemId === MENU_PICK) openPicker();
    else if (info.menuItemId === MENU_OPTIONS) api.runtime.openOptionsPage();
  });
})();
