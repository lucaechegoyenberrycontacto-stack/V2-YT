// =============================================================
// Shared cloud-sync helper for the dashboard.
// Each page calls initCloudSync({...}) once with its config:
//   appKey         — string row key in the public.app_state table
//   syncedKeys     — exact localStorage keys to mirror
//   syncedPrefixes — localStorage key prefixes to mirror (e.g. 'goals:')
//   onApplied      — optional callback after remote state has been applied
//
// Requires:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="sync.js" defer></script>
// =============================================================
(function () {
  'use strict';

  // Prefer Vercel env vars (served via /api/config → window.DASH_*),
  // otherwise fall back to these defaults.
  const SUPABASE_URL = (typeof window !== 'undefined' && window.DASH_SUPABASE_URL) || 'https://bkkjtxvneldsqwyhrhub.supabase.co';
  const SUPABASE_KEY = (typeof window !== 'undefined' && window.DASH_SUPABASE_KEY) || 'sb_publishable_G8LqREPRDk0_tMEJNSFBxA_mIXNAnmT';

  window.initCloudSync = function (config) {
    const appKey = config && config.appKey;
    const syncedKeys = (config && config.syncedKeys) || [];
    const syncedPrefixes = (config && config.syncedPrefixes) || [];
    const onApplied = config && config.onApplied;
    if (!appKey) return;
    if (!window.supabase) return;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    if (SUPABASE_URL.indexOf('PASTE-') === 0 || SUPABASE_KEY.indexOf('PASTE-') === 0) return;

    let supa = null;
    let pushTimer = null;
    let suppressSync = false;
    let lastSyncedJson = null;
    // Best-effort snapshot of the last remote row contents we saw (from a
    // pull, a realtime update, or our own last successful merged push).
    // Used to merge outgoing pushes instead of replacing the whole row —
    // see pushNow/flushOnUnload below. Two pages can share the same
    // appKey with different (narrower) syncedKeys (e.g. po-water.html and
    // health.html both use 'health'); a plain upsert from the narrower
    // page would otherwise silently wipe out whatever the other page
    // stored under keys it doesn't know about.
    let lastKnownRemote = {};

    function matches(k) {
      if (!k) return false;
      if (syncedKeys.indexOf(k) !== -1) return true;
      for (let i = 0; i < syncedPrefixes.length; i++) {
        if (k.indexOf(syncedPrefixes[i]) === 0) return true;
      }
      return false;
    }
    function listAllKeys() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (matches(k)) out.push(k);
      }
      return out;
    }
    function collect() {
      const out = {};
      for (const k of listAllKeys()) {
        const v = localStorage.getItem(k);
        if (v == null) continue;
        try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
      }
      return out;
    }

    const origSet = localStorage.setItem.bind(localStorage);
    const origRemove = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      origSet(k, v);
      try { if (!suppressSync && matches(k)) schedulePush(); } catch (e) {}
    };
    localStorage.removeItem = function (k) {
      origRemove(k);
      try { if (!suppressSync && matches(k)) schedulePush(); } catch (e) {}
    };

    function applyRemote(remote) {
      if (!remote || typeof remote !== 'object') return false;
      lastKnownRemote = remote;
      suppressSync = true;
      let changed = false;
      try {
        for (const k of Object.keys(remote)) {
          if (!matches(k)) continue;
          const incoming = JSON.stringify(remote[k]);
          const local = localStorage.getItem(k);
          if (local !== incoming) {
            try { origSet(k, incoming); changed = true; } catch (e) {}
          }
        }
        // Deliberately does NOT delete local keys just because they're
        // absent from `remote` — a key can be legitimately missing from
        // this row's snapshot (e.g. another page sharing this appKey with
        // a narrower syncedKeys list just pushed) without meaning "please
        // delete this everywhere". No page in this app relies on key
        // removal propagating through sync; only additive/update.
      } finally { suppressSync = false; }
      if (changed && typeof onApplied === 'function') {
        try { onApplied(); } catch (e) {}
      }
      return changed;
    }

    // Merges onto the last known remote row instead of replacing it
    // outright, so this page can never wipe out keys that only a
    // different page (sharing the same appKey) manages.
    async function pushNow() {
      if (!supa) return;
      const localState = collect();
      const json = JSON.stringify(localState);
      if (json === lastSyncedJson) return;
      try {
        const { data } = await supa.from('app_state').select('data').eq('key', appKey).maybeSingle();
        if (data && data.data && typeof data.data === 'object') lastKnownRemote = data.data;
      } catch (e) {}
      const merged = Object.assign({}, lastKnownRemote, localState);
      try {
        const { error } = await supa.from('app_state').upsert(
          { key: appKey, data: merged, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        if (!error) { lastSyncedJson = json; lastKnownRemote = merged; }
      } catch (e) {}
    }
    function schedulePush() {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 250);
    }
    // Unload fallback — merges onto the last known remote snapshot we
    // already have in memory (no time for a fresh round-trip before the
    // page actually closes), which is still far safer than a blind
    // replace: it only risks staleness for keys another page changed in
    // the same ~250ms window, never wholesale deletion of them.
    function flushOnUnload() {
      const localState = collect();
      const json = JSON.stringify(localState);
      if (json === lastSyncedJson) return;
      const merged = Object.assign({}, lastKnownRemote, localState);
      try {
        fetch(SUPABASE_URL + '/rest/v1/app_state?on_conflict=key', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ key: appKey, data: merged, updated_at: new Date().toISOString() }),
          keepalive: true,
        }).catch(() => {});
        lastSyncedJson = json;
      } catch (e) {}
    }

    (async function init() {
      // persistSession/autoRefreshToken:false — this client (shared by
      // every page that calls initCloudSync) only ever does anon-role
      // CRUD, no .auth. calls. Left at defaults, it would silently share
      // and auto-refresh whatever real user session login.html/
      // nutrition.html's DataLayer created (same localStorage key,
      // same-origin) — multiple independent clients across pages/tabs
      // racing to refresh that one rotating session caused intermittent
      // 401s dashboard-wide, confirmed via Supabase API + Auth logs.
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      try {
        const { data, error } = await supa
          .from('app_state').select('data').eq('key', appKey).maybeSingle();
        if (!error && data && data.data && Object.keys(data.data).length > 0) {
          lastSyncedJson = JSON.stringify(data.data);
          applyRemote(data.data);
        } else if (Object.keys(collect()).length > 0) {
          schedulePush();
        }
      } catch (e) {}
      supa.channel('app_state_' + appKey)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'app_state',
          filter: 'key=eq.' + appKey,
        }, (payload) => {
          if (!payload.new || !payload.new.data) return;
          const incoming = JSON.stringify(payload.new.data);
          if (incoming === lastSyncedJson) return;
          lastSyncedJson = incoming;
          applyRemote(payload.new.data);
        })
        .subscribe();
    })();

    window.addEventListener('beforeunload', flushOnUnload);
    window.addEventListener('pagehide', flushOnUnload);
    window.addEventListener('storage', (e) => {
      if (e.key && matches(e.key)) schedulePush();
    });
  };
})();
