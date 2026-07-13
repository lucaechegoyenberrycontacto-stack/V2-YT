// =============================================================
// In-memory, cross-channel sync status store. Each of the three
// independent sync engines (sync.js, gymPesasStore.js, gym.html's
// pcPushNow) calls report(channel, ok) after every push attempt;
// topbar.js subscribes to render a single aggregate indicator.
//
// Not persisted anywhere (no localStorage) — this is a session-only
// signal, reset on every page load, same as the data it describes
// being freshly re-synced on load.
//
// Load this BEFORE sync.js / gymPesasStore.js / gym.html's inline
// pcPushNow block on any page that uses one of them, so
// window.DashSyncStatus already exists by the time they report.
// =============================================================
(function () {
  'use strict';

  // A single isolated failure is treated as transient network noise,
  // not a real outage — the pill only turns red once a channel has
  // failed at least twice AND stayed failed for RECOVERY_GRACE_MS
  // since its last real success.
  const RECOVERY_GRACE_MS = 30000;

  const channels = {}; // name -> { lastSuccessAt: number|null, consecutiveFailures: number }
  const subscribers = [];

  function getChannel(name) {
    if (!channels[name]) {
      channels[name] = { lastSuccessAt: null, consecutiveFailures: 0 };
    }
    return channels[name];
  }

  function channelIsError(ch) {
    if (ch.consecutiveFailures < 2) return false;
    if (ch.lastSuccessAt == null) return true;
    return (Date.now() - ch.lastSuccessAt) > RECOVERY_GRACE_MS;
  }

  function getState() {
    const out = { status: 'ok', channels: {} };
    Object.keys(channels).forEach(function (name) {
      const ch = channels[name];
      const isError = channelIsError(ch);
      out.channels[name] = {
        status: isError ? 'error' : 'ok',
        lastSuccessAt: ch.lastSuccessAt,
        consecutiveFailures: ch.consecutiveFailures,
      };
      if (isError) out.status = 'error';
    });
    return out;
  }

  function notify() {
    const state = getState();
    subscribers.forEach(function (cb) {
      try { cb(state); } catch (e) {}
    });
  }

  function report(channelName, ok) {
    if (!channelName) return;
    const ch = getChannel(channelName);
    if (ok) {
      ch.consecutiveFailures = 0;
      ch.lastSuccessAt = Date.now();
    } else {
      ch.consecutiveFailures += 1;
    }
    notify();
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return function () {};
    subscribers.push(callback);
    return function unsubscribe() {
      const i = subscribers.indexOf(callback);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }

  window.DashSyncStatus = { report: report, getState: getState, subscribe: subscribe };
})();
