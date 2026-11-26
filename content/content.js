/**
 * Content-script entry point: loads the profile, exposes the messaging
 * API used by the popup/background, and keeps the profile in sync.
 */
"use strict";
(() => {
  if (window.__JA_CONTENT_SCRIPT__) return;
  window.__JA_CONTENT_SCRIPT__ = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  let profile = null;
  let loading = null;
  let launcherDecision = null;

  const loadProfile = async (force = false) => {
    if (!force && profile) return profile;
    if (loading) return loading;
    loading = window.JAProfile.load()
      .then((next) => {
        profile = next;
        window.JAFiller.setProfile(next);
        updateLauncher();
        return next;
      })
      .catch((error) => {
        console.warn("[Job Autofill] Profile load failed", error);
        return profile;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  };

  const updateLauncher = () => {
    if (!profile) return;
    const wanted = Boolean(profile.settings && profile.settings.showPanelButton) && window.top === window;
    if (wanted && !window.JAProfile.isProfileEmpty(profile)) {
      if (launcherDecision !== "shown") {
        window.JAPicker.mountLauncher();
        launcherDecision = "shown";
      }
    } else if (launcherDecision !== "hidden") {
      window.JAPicker.unmountLauncher();
      launcherDecision = "hidden";
    }
  };

  const pageInfo = () => ({
    title: document.title || "",
    url: location.href,
    host: location.hostname || location.host || "",
    topFrame: window.top === window
  });

  const scanResponse = () => {
    const { fields, stats } = window.JAFiller.describeAll();
    return {
      ok: true,
      fields,
      stats,
      page: pageInfo(),
      hasProfile: Boolean(profile) && !window.JAProfile.isProfileEmpty(profile),
      completeness: window.JAProfile.completeness(profile || window.JAProfile.DEFAULT_PROFILE),
      settings: (profile && profile.settings) || {},
      blocked: window.JAProfile.isBlocked(profile, location.hostname),
      hasFileInput: Boolean(document.querySelector('input[type="file"]'))
    };
  };

  const handleMessage = async (message) => {
    if (!message || typeof message.type !== "string") return { ok: false, error: "Unknown message" };
    try {
      switch (message.type) {
        case "PING":
          return { ok: true, frame: pageInfo() };

        case "SCAN":
          await loadProfile(true);
          return scanResponse();

        case "FILL_ALL": {
          await loadProfile(true);
          if (!profile || window.JAProfile.isProfileEmpty(profile)) {
            return {
              ok: false,
              error: "Your career profile is empty. Open the extension options and fill it first."
            };
          }
          const overwrite =
            message.overwrite === undefined
              ? !(profile.settings && profile.settings.fillOnlyEmpty)
              : Boolean(message.overwrite);
          const summary = await window.JAFiller.fillPage({ overwrite });
          return { ok: true, summary, ...scanResponse() };
        }

        case "FILL_ONE": {
          await loadProfile(true);
          const result = await window.JAFiller.fillById(message.fieldId, message.value);
          return { ok: Boolean(result && result.ok), result, ...scanResponse() };
        }

        case "START_PICK":
          await loadProfile(true);
          window.JAPicker.show();
          return { ok: true };

        case "STOP_PICK":
          window.JAPicker.hide();
          return { ok: true };

        case "UNDO": {
          const result = await window.JAFiller.undo();
          return { ok: Boolean(result && result.ok), result, ...scanResponse() };
        }

        case "RELOAD_PROFILE":
          await loadProfile(true);
          return scanResponse();

        default:
          return { ok: false, error: `Unknown message type: ${message.type}` };
      }
    } catch (error) {
      console.error("[Job Autofill] Message failed", message.type, error);
      return { ok: false, error: String(error && error.message ? error.message : error) };
    }
  };

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message) => handleMessage(message));
  }

  if (api && api.storage && api.storage.onChanged) {
    window.JAProfile.onChanged((next) => {
      profile = next;
      window.JAFiller.setProfile(next);
      updateLauncher();
    });
  }

  loadProfile().catch(() => {});
})();
