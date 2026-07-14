// =============================================================
// DataLayer — the only gateway to Supabase for pages migrated onto
// the new public.records schema (collection, id, data jsonb).
// Unlike sync.js (which mirrors whole localStorage rows), each record
// here is addressed individually by (collection, id), which is what
// makes per-item delete actually propagate across devices.
//
// Requires, in this order:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="dataLayer.js" defer></script>
//
// Usage:
//   await DataLayer.init({ requireAuth: true });
//   const foods = await DataLayer.list('nutrition_foods');
//   await DataLayer.put('nutrition_foods', food.id, {name, kcal, ...});
//   DataLayer.subscribe('nutrition_foods', () => { ...re-render... });
// =============================================================
(function () {
  'use strict';

  // Prefer Vercel env vars (served via /api/config → window.DASH_*),
  // otherwise fall back to the same defaults sync.js uses.
  const SUPABASE_URL = (typeof window !== 'undefined' && window.DASH_SUPABASE_URL) || 'https://bkkjtxvneldsqwyhrhub.supabase.co';
  const SUPABASE_KEY = (typeof window !== 'undefined' && window.DASH_SUPABASE_KEY) || 'sb_publishable_G8LqREPRDk0_tMEJNSFBxA_mIXNAnmT';

  const QUEUE_KEY = 'dlqueue';
  const RETRY_DELAYS = [1000, 3000, 8000];
  // How long we consider a (collection,id) write "ours" for the purpose of
  // swallowing the realtime echo of our own put()/remove() calls. DELETE
  // payloads from Postgres only carry the primary key (no data._src field
  // to compare), so instead of tagging payloads we just remember our own
  // recent writes locally and ignore any realtime event that matches one
  // within this window — same effect, works uniformly for put and remove.
  const SELF_WRITE_TTL_MS = 8000;

  let supa = null;
  let dotEl = null;
  let toastEl = null;
  let toastShown = false;
  let pendingOps = 0;
  let queueProcessing = false;

  /** @type {Map<string, number>} 'collection:id' -> timestamp of our own last write */
  const recentLocalWrites = new Map();
  /** @type {Map<string, Set<Function>>} collection -> subscriber callbacks */
  const subscriptions = new Map();
  /** @type {Map<string, object>} collection -> realtime channel */
  const channelsByCollection = new Map();
  /** @type {Map<string, Array<{key:string, transform:Function|undefined}>>} collection -> legacy mirrors */
  const legacyMirrors = new Map();

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  /* ================= local cache (localStorage 'dlcache:<collection>') =================
     Always stored as an array of {id, ...data} rows, regardless of whether
     the collection is used as a list or as a singleton (id 'main'). */
  function cacheKey(collection) { return 'dlcache:' + collection; }
  function readCache(collection) {
    try {
      const v = JSON.parse(localStorage.getItem(cacheKey(collection)));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      console.warn('[DataLayer] failed to read cache for', collection, e);
      return [];
    }
  }
  function writeCache(collection, rows) {
    try {
      localStorage.setItem(cacheKey(collection), JSON.stringify(rows));
    } catch (e) {
      console.warn('[DataLayer] failed to write cache for', collection, e);
    }
  }
  function upsertCacheEntry(collection, row) {
    const rows = readCache(collection);
    const idx = rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) rows[idx] = row; else rows.push(row);
    writeCache(collection, rows);
  }
  function removeCacheEntry(collection, id) {
    const rows = readCache(collection).filter((r) => r.id !== id);
    writeCache(collection, rows);
  }

  /* ================= legacy mirrors ================= */
  function refreshLegacyMirrorsFor(collection, key, transform) {
    const rows = readCache(collection);
    const value = typeof transform === 'function' ? transform(rows) : rows;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[DataLayer] failed to write legacy mirror', key, 'for', collection, e);
    }
  }
  function refreshLegacyMirrors(collection) {
    const mirrors = legacyMirrors.get(collection);
    if (!mirrors) return;
    mirrors.forEach((m) => refreshLegacyMirrorsFor(collection, m.key, m.transform));
  }

  /* ================= subscribers ================= */
  function notifySubscribers(collection) {
    const cbs = subscriptions.get(collection);
    if (!cbs) return;
    cbs.forEach((cb) => {
      try { cb(); } catch (e) { console.warn('[DataLayer] subscriber callback threw for', collection, e); }
    });
  }

  /* ================= status indicator UI ================= */
  function injectStatusUI() {
    if (document.getElementById('dl-status-dot')) { dotEl = document.getElementById('dl-status-dot'); toastEl = document.getElementById('dl-toast'); return; }
    const style = document.createElement('style');
    style.textContent =
      '#dl-status-dot{position:fixed;right:14px;bottom:14px;width:10px;height:10px;border-radius:50%;' +
      'background:#6BE3A4;border:1px solid rgba(255,255,255,0.25);box-shadow:0 0 0 3px rgba(0,0,0,0.35),0 2px 8px rgba(0,0,0,0.4);' +
      'z-index:9999;cursor:default;transition:background 0.3s;}' +
      '#dl-status-dot[data-dl-state="pending"]{background:#F2C063;animation:dl-pulse 1.4s ease-in-out infinite;}' +
      '#dl-status-dot[data-dl-state="error"]{background:#FF6B6B;}' +
      '@keyframes dl-pulse{0%,100%{opacity:1;}50%{opacity:0.45;}}' +
      '#dl-toast{position:fixed;right:14px;bottom:34px;max-width:280px;padding:10px 14px;' +
      'background:rgba(19,19,22,0.94);color:#FAFAFA;font-size:12px;line-height:1.4;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.45);' +
      'z-index:9999;opacity:0;transform:translateY(6px);transition:opacity 0.25s,transform 0.25s;pointer-events:none;}' +
      '#dl-toast.on{opacity:1;transform:translateY(0);}';
    document.head.appendChild(style);

    dotEl = document.createElement('div');
    dotEl.id = 'dl-status-dot';
    dotEl.title = 'Todo guardado';
    document.body.appendChild(dotEl);

    toastEl = document.createElement('div');
    toastEl.id = 'dl-toast';
    toastEl.textContent = 'Sin conexión — los cambios se guardarán automáticamente';
    document.body.appendChild(toastEl);
  }
  function setStatus(state, detail) {
    if (!dotEl) return;
    dotEl.setAttribute('data-dl-state', state);
    const labels = { ok: 'Todo guardado', pending: 'Guardando…', error: 'Sin conexión con la nube — reintentando' };
    dotEl.title = detail || labels[state] || '';
  }
  function showOfflineToastOnce() {
    if (toastShown || !toastEl) return;
    toastShown = true;
    toastEl.classList.add('on');
    setTimeout(() => { toastEl.classList.remove('on'); toastShown = false; }, 5000);
  }
  function beginOp() {
    pendingOps++;
    setStatus('pending');
  }
  function endOp() {
    pendingOps = Math.max(0, pendingOps - 1);
    if (pendingOps === 0) {
      const remaining = readQueue();
      setStatus(remaining.length ? 'error' : 'ok');
    }
  }

  /* ================= offline queue (localStorage 'dlqueue') ================= */
  function readQueue() {
    try {
      const v = JSON.parse(localStorage.getItem(QUEUE_KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      console.warn('[DataLayer] failed to read queue', e);
      return [];
    }
  }
  function writeQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch (e) {
      console.warn('[DataLayer] failed to persist queue', e);
    }
  }
  function enqueue(item) {
    // Last write wins: drop any earlier queued op for the same row so we
    // never replay a stale intermediate state once connectivity returns.
    const rest = readQueue().filter((x) => !(x.collection === item.collection && x.id === item.id));
    rest.push(item);
    writeQueue(rest);
  }
  async function processQueue() {
    if (queueProcessing || !supa) return;
    const initial = readQueue();
    if (!initial.length) return;
    queueProcessing = true;
    setStatus('pending', initial.length + ' cambio(s) pendientes de sincronizar');
    try {
      while (true) {
        const q = readQueue();
        if (!q.length) break;
        const item = q[0];
        let ok = false;
        try {
          if (item.op === 'delete') {
            const { error } = await supa.from('records').delete().eq('collection', item.collection).eq('id', item.id);
            if (error) throw error;
          } else {
            const { error } = await supa.from('records').upsert(
              { collection: item.collection, id: item.id, data: item.data, updated_at: new Date().toISOString() },
              { onConflict: 'collection,id' }
            );
            if (error) throw error;
          }
          ok = true;
        } catch (e) {
          console.warn('[DataLayer] queue flush failed, will retry later', item, e);
        }
        if (!ok) break;
        writeQueue(readQueue().slice(1));
      }
    } finally {
      queueProcessing = false;
      const remaining = readQueue();
      setStatus(remaining.length ? 'error' : 'ok', remaining.length ? remaining.length + ' cambio(s) pendientes' : undefined);
    }
  }

  /* ================= write helper with backoff ================= */
  async function writeWithRetries(fn) {
    try { await fn(); return true; } catch (e) { console.warn('[DataLayer] write failed, will retry', e); }
    for (const delay of RETRY_DELAYS) {
      await sleep(delay);
      try { await fn(); return true; } catch (e) { console.warn('[DataLayer] retry failed', e); }
    }
    return false;
  }

  /* ================= realtime ================= */
  function handleRealtimeEvent(collection, payload) {
    const id = (payload.new && payload.new.id) || (payload.old && payload.old.id);
    if (id == null) return;
    const key = collection + ':' + id;
    const recentTs = recentLocalWrites.get(key);
    if (recentTs && (Date.now() - recentTs) < SELF_WRITE_TTL_MS) {
      // Echo of a write this tab just made — already applied locally.
      recentLocalWrites.delete(key);
      return;
    }
    if (payload.eventType === 'DELETE') {
      removeCacheEntry(collection, id);
    } else if (payload.new) {
      upsertCacheEntry(collection, Object.assign({ id: id }, payload.new.data));
    }
    refreshLegacyMirrors(collection);
    notifySubscribers(collection);
  }
  function ensureChannel(collection) {
    if (channelsByCollection.has(collection)) return;
    const channel = supa.channel('records_' + collection)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'records',
        filter: 'collection=eq.' + collection,
      }, (payload) => handleRealtimeEvent(collection, payload))
      .subscribe();
    channelsByCollection.set(collection, channel);
  }

  /* ================= fetch + cache ================= */
  // Reports whether the fetched rows actually differ from what was already
  // cached — list()'s warm-cache path uses this to decide whether to
  // notify subscribers. Without it, a background refresh notifies
  // unconditionally, and a subscriber that itself calls list() (the
  // pattern every migrated page uses) re-triggers another unconditional
  // notify — an infinite loop from a single realtime event, since nothing
  // ever needed to have changed for the cycle to keep going.
  async function fetchAndCache(collection) {
    try {
      const { data, error } = await supa.from('records').select('id,data').eq('collection', collection).order('id', { ascending: true });
      if (error) throw error;
      const rows = (data || []).map((r) => Object.assign({ id: r.id }, r.data));
      const changed = JSON.stringify(rows) !== JSON.stringify(readCache(collection));
      writeCache(collection, rows);
      return { rows: rows, changed: changed };
    } catch (e) {
      console.warn('[DataLayer] list fetch failed, serving cache for', collection, e);
      return { rows: readCache(collection), changed: false };
    }
  }

  /**
   * Initializes the Supabase client, verifies the session, and (if
   * requireAuth is set and there is no session) redirects to login.html.
   * @param {{requireAuth?: boolean}} [opts]
   * @returns {Promise<object|null>} the current session, or null
   */
  async function init(opts) {
    opts = opts || {};
    if (!window.supabase) {
      console.warn('[DataLayer] supabase-js is not loaded — include the CDN script before dataLayer.js');
      return null;
    }
    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    injectStatusUI();

    let session = null;
    try {
      const { data, error } = await supa.auth.getSession();
      if (error) throw error;
      session = data && data.session;
    } catch (e) {
      console.warn('[DataLayer] auth.getSession() failed', e);
    }

    if (!session && opts.requireAuth) {
      const next = encodeURIComponent(location.pathname + location.search + location.hash);
      location.href = 'login.html?next=' + next;
      return null;
    }

    setStatus('ok');
    window.addEventListener('online', processQueue);
    window.addEventListener('offline', () => setStatus('error', 'Sin conexión con la nube'));
    setInterval(processQueue, 30000);
    processQueue();
    return session;
  }

  /**
   * Lists every row in a collection. Paints from the local cache
   * immediately if one exists, kicks a background refresh against
   * Supabase, and notifies subscribers once the fresh data lands.
   * @param {string} collection
   * @returns {Promise<Array<object>>} array of {id, ...data} rows
   */
  async function list(collection) {
    if (!supa) { console.warn('[DataLayer] list() called before init()'); return readCache(collection); }
    const cached = readCache(collection);
    if (cached.length) {
      fetchAndCache(collection).then((result) => {
        refreshLegacyMirrors(collection);
        if (result.changed) notifySubscribers(collection);
      });
      return cached;
    }
    const fresh = await fetchAndCache(collection);
    refreshLegacyMirrors(collection);
    return fresh.rows;
  }

  /**
   * Gets a single row by id, falling back to the cached copy on error.
   * @param {string} collection
   * @param {string} id
   * @returns {Promise<object|null>} {id, ...data}, or null if not found
   */
  async function get(collection, id) {
    if (!supa) { console.warn('[DataLayer] get() called before init()'); return readCache(collection).find((r) => r.id === id) || null; }
    const cachedHit = readCache(collection).find((r) => r.id === id) || null;
    try {
      const { data, error } = await supa.from('records').select('id,data').eq('collection', collection).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return cachedHit;
      const row = Object.assign({ id: data.id }, data.data);
      upsertCacheEntry(collection, row);
      return row;
    } catch (e) {
      console.warn('[DataLayer] get failed, serving cache for', collection, id, e);
      return cachedHit;
    }
  }

  /**
   * Reads the singleton row (id 'main') of a collection.
   * @param {string} collection
   * @returns {Promise<object>} the row's data (without the id field), or {} if absent
   */
  async function getSingleton(collection) {
    const row = await get(collection, 'main');
    if (!row) return {};
    const clone = Object.assign({}, row);
    delete clone.id;
    return clone;
  }

  /**
   * Upserts a row. Updates the local cache and legacy mirrors immediately
   * (optimistic), then awaits the write with retries (1s, 3s, 8s). If all
   * retries fail, the write is queued for later and the promise still
   * resolves — the status dot/toast reflect the pending state truthfully.
   * @param {string} collection
   * @param {string} id
   * @param {object} dataObj fields to store (id is implied by the id param)
   * @returns {Promise<true>}
   */
  async function put(collection, id, dataObj) {
    if (!supa) { console.warn('[DataLayer] put() called before init()'); return true; }
    const key = collection + ':' + id;
    recentLocalWrites.set(key, Date.now());
    upsertCacheEntry(collection, Object.assign({ id: id }, dataObj));
    refreshLegacyMirrors(collection);
    notifySubscribers(collection);

    beginOp();
    const ok = await writeWithRetries(async () => {
      const { error } = await supa.from('records').upsert(
        { collection: collection, id: id, data: dataObj, updated_at: new Date().toISOString() },
        { onConflict: 'collection,id' }
      );
      if (error) throw error;
    });
    if (!ok) {
      enqueue({ collection: collection, id: id, op: 'put', data: dataObj, ts: Date.now() });
      showOfflineToastOnce();
    }
    endOp();
    return true;
  }

  /**
   * Upserts the singleton row (id 'main') of a collection.
   * @param {string} collection
   * @param {object} dataObj
   * @returns {Promise<true>}
   */
  function putSingleton(collection, dataObj) {
    return put(collection, 'main', dataObj);
  }

  /**
   * Deletes a row. Same optimistic-cache + retry-then-queue policy as put().
   * @param {string} collection
   * @param {string} id
   * @returns {Promise<true>}
   */
  async function remove(collection, id) {
    if (!supa) { console.warn('[DataLayer] remove() called before init()'); return true; }
    const key = collection + ':' + id;
    recentLocalWrites.set(key, Date.now());
    removeCacheEntry(collection, id);
    refreshLegacyMirrors(collection);
    notifySubscribers(collection);

    beginOp();
    const ok = await writeWithRetries(async () => {
      const { error } = await supa.from('records').delete().eq('collection', collection).eq('id', id);
      if (error) throw error;
    });
    if (!ok) {
      enqueue({ collection: collection, id: id, op: 'delete', ts: Date.now() });
      showOfflineToastOnce();
    }
    endOp();
    return true;
  }

  /**
   * Subscribes to realtime changes on a collection. The callback is
   * invoked (with no arguments) after the local cache has already been
   * updated, so subscribers should just re-read via list()/get() and
   * re-render. Events this same tab caused (via put/remove) are swallowed.
   * @param {string} collection
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  function subscribe(collection, callback) {
    if (!supa) { console.warn('[DataLayer] subscribe() called before init()'); return function () {}; }
    if (!subscriptions.has(collection)) subscriptions.set(collection, new Set());
    subscriptions.get(collection).add(callback);
    ensureChannel(collection);
    return function unsubscribe() {
      const cbs = subscriptions.get(collection);
      if (cbs) cbs.delete(callback);
    };
  }

  /**
   * Mirrors a collection's cache into a legacy localStorage key, so pages
   * that haven't been migrated yet keep reading data from this device.
   * Re-applied after every local or remote change to the collection.
   * @param {string} collection
   * @param {string} localStorageKey
   * @param {(rows: Array<object>) => any} [transform] shapes the cached rows into the legacy format; defaults to passing the rows through as-is
   */
  function setLegacyMirror(collection, localStorageKey, transform) {
    const list2 = legacyMirrors.get(collection) || [];
    list2.push({ key: localStorageKey, transform: transform });
    legacyMirrors.set(collection, list2);
    refreshLegacyMirrorsFor(collection, localStorageKey, transform);
  }

  window.DataLayer = {
    init: init,
    list: list,
    get: get,
    getSingleton: getSingleton,
    put: put,
    putSingleton: putSingleton,
    remove: remove,
    subscribe: subscribe,
    setLegacyMirror: setLegacyMirror,
  };
})();
