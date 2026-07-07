// Data store for the Pesas section of the training module (gym.html):
// exercise->muscle overrides (on top of gymExerciseMuscleSeed.js), the
// muscle-fatigue config, and the mobility log. Replaces the old gymData.js
// (routines/versioned exercise library, discarded — see project spec).
// Backed by its own debounced Supabase sync channel (same pattern as the
// old gymData.js / workout_history), table `gym_pesas_store` — a separate
// concern from workout_history, which only holds the per-session log.
//
// Must load BEFORE the inline <script> in gym.html that runs the Lyfta
// import filter (partitionWorkoutExercises), so it's placed in the <head>
// script cluster alongside gymMuscleEnum.js/gymMuscleFatigue.js — unlike
// gymData.js, which only needed to exist before gymUI.js at the bottom.
(function () {
  const GP_LS_KEY = 'po_coach_pesas_store_v1';
  const GP_TABLE = 'gym_pesas_store';
  const GP_KEY = 'pesas_store';
  const SUPABASE_URL = (typeof window !== 'undefined' && window.DASH_SUPABASE_URL) || 'https://bkkjtxvneldsqwyhrhub.supabase.co';
  const SUPABASE_KEY = (typeof window !== 'undefined' && window.DASH_SUPABASE_KEY) || 'sb_publishable_G8LqREPRDk0_tMEJNSFBxA_mIXNAnmT';

  function gpUid(prefix) { return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 9999); }

  function seedExercises() { return (window.EXERCISE_MUSCLE_SEED && window.EXERCISE_MUSCLE_SEED.exercises) || {}; }
  function seedDiscard() { return (window.EXERCISE_MUSCLE_SEED && window.EXERCISE_MUSCLE_SEED.discard) || []; }
  function seedEntry(name) { return seedExercises()[name] || null; }

  function gpDefaultFatigueConfig() {
    // Deep-clone so mutating the loaded config never touches the shared
    // module default in gymMuscleFatigue.js.
    return JSON.parse(JSON.stringify(window.DEFAULT_MUSCLE_FATIGUE_CONFIG || { isPlaceholder: true, muscles: {}, cardioMuscleMap: {} }));
  }
  function gpDefault() {
    return { exerciseOverrides: {}, muscleFatigueConfig: gpDefaultFatigueConfig(), mobilityLog: [] };
  }

  function gpNormalizeOverride(name, o) {
    o = o || {};
    const seed = seedEntry(name) || {};
    return {
      primaryMuscle: o.primaryMuscle !== undefined ? o.primaryMuscle : (seed.primaryMuscle != null ? seed.primaryMuscle : null),
      secondaryMuscles: Array.isArray(o.secondaryMuscles) ? o.secondaryMuscles.slice() : (Array.isArray(seed.secondaryMuscles) ? seed.secondaryMuscles.slice() : []),
      isMobility: o.isMobility !== undefined ? !!o.isMobility : !!seed.isMobility,
    };
  }
  function gpNormalizeMobilityEntry(e) {
    e = e || {};
    return {
      id: e.id || gpUid('mob'),
      date: e.date || new Date().toISOString().slice(0, 10),
      name: e.name || '',
      reps: (e.reps != null && e.reps !== '') ? Number(e.reps) : null,
    };
  }
  function gpNormalize(raw) {
    raw = raw || {};
    const overrides = {};
    if (raw.exerciseOverrides && typeof raw.exerciseOverrides === 'object') {
      Object.keys(raw.exerciseOverrides).forEach(function (name) {
        overrides[name] = gpNormalizeOverride(name, raw.exerciseOverrides[name]);
      });
    }
    return {
      exerciseOverrides: overrides,
      muscleFatigueConfig: (raw.muscleFatigueConfig && typeof raw.muscleFatigueConfig === 'object')
        ? raw.muscleFatigueConfig
        : gpDefaultFatigueConfig(),
      mobilityLog: Array.isArray(raw.mobilityLog) ? raw.mobilityLog.map(gpNormalizeMobilityEntry) : [],
    };
  }

  function gpLoad() {
    try {
      const raw = localStorage.getItem(GP_LS_KEY);
      if (raw) return gpNormalize(JSON.parse(raw));
    } catch (e) {}
    return gpDefault();
  }
  function gpSaveLocal() {
    try { localStorage.setItem(GP_LS_KEY, JSON.stringify(gpData)); } catch (e) {}
  }
  let gpData = gpLoad();

  // ---- Debounced Supabase sync — same 250ms schedulePush pattern used
  // elsewhere in this module (workout_history, the old gymData.js). ----
  let gpSupa = null;
  let gpPushTimer = null;
  let gpLastSyncedJson = null;

  async function gpPushNow() {
    if (!gpSupa) return;
    const json = JSON.stringify(gpData);
    if (json === gpLastSyncedJson) return;
    try {
      const { error } = await gpSupa.from(GP_TABLE).upsert(
        { key: GP_KEY, data: gpData, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (!error) gpLastSyncedJson = json;
    } catch (e) {}
  }
  function gpSchedulePush() {
    clearTimeout(gpPushTimer);
    gpPushTimer = setTimeout(gpPushNow, 250);
  }
  function gpFlushOnUnload() {
    const json = JSON.stringify(gpData);
    if (json === gpLastSyncedJson || !SUPABASE_URL || !SUPABASE_KEY) return;
    try {
      fetch(SUPABASE_URL + '/rest/v1/' + GP_TABLE + '?on_conflict=key', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ key: GP_KEY, data: gpData, updated_at: new Date().toISOString() }),
        keepalive: true,
      }).catch(function () {});
      gpLastSyncedJson = json;
    } catch (e) {}
  }

  function gpCommit() {
    gpSaveLocal();
    if (typeof window.gpsOnChange === 'function') { try { window.gpsOnChange(gpData); } catch (e) {} }
    gpSchedulePush();
  }

  (async function gpInitCloudSync() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return;
    if (SUPABASE_URL.indexOf('PASTE-') === 0 || SUPABASE_KEY.indexOf('PASTE-') === 0) return;
    gpSupa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      const { data, error } = await gpSupa.from(GP_TABLE).select('data').eq('key', GP_KEY).maybeSingle();
      if (!error && data && data.data && typeof data.data === 'object') {
        gpData = gpNormalize(data.data);
        gpLastSyncedJson = JSON.stringify(gpData);
        gpSaveLocal();
        if (typeof window.gpsOnChange === 'function') { try { window.gpsOnChange(gpData); } catch (e) {} }
      } else if (Object.keys(gpData.exerciseOverrides).length || gpData.mobilityLog.length) {
        gpPushNow();
      }
    } catch (e) {}
    try {
      gpSupa.channel('gym_pesas_store_' + GP_KEY)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: GP_TABLE, filter: 'key=eq.' + GP_KEY,
        }, function (payload) {
          if (!payload.new || !payload.new.data) return;
          const normalized = gpNormalize(payload.new.data);
          const incoming = JSON.stringify(normalized);
          if (incoming === gpLastSyncedJson) return;
          gpLastSyncedJson = incoming;
          gpData = normalized;
          gpSaveLocal();
          if (typeof window.gpsOnChange === 'function') { try { window.gpsOnChange(gpData); } catch (e) {} }
        })
        .subscribe();
    } catch (e) {}
  })();
  window.addEventListener('beforeunload', gpFlushOnUnload);
  window.addEventListener('pagehide', gpFlushOnUnload);

  // ---- Exercise -> muscle map (seed + user overrides) ----
  function isDiscarded(name) { return seedDiscard().indexOf(name) !== -1; }

  function getExerciseInfo(name) {
    const seed = seedEntry(name);
    const override = gpData.exerciseOverrides[name];
    if (!seed && !override) {
      return { primaryMuscle: null, secondaryMuscles: [], isMobility: false, isAssigned: false, inMap: false };
    }
    const base = Object.assign({ primaryMuscle: null, secondaryMuscles: [] }, seed || {}, override || {});
    return {
      primaryMuscle: base.primaryMuscle != null ? base.primaryMuscle : null,
      secondaryMuscles: Array.isArray(base.secondaryMuscles) ? base.secondaryMuscles.slice() : [],
      isMobility: !!base.isMobility,
      isAssigned: base.primaryMuscle != null || !!base.isMobility,
      inMap: true,
    };
  }

  // Registers a bare "sin asignar" entry the first time an unfamiliar name
  // is seen (import or manual entry) — idempotent, never overwrites an
  // existing seed entry or user override.
  function ensureExercise(name) {
    if (!name) return;
    if (seedEntry(name)) return;
    if (gpData.exerciseOverrides[name]) return;
    gpData.exerciseOverrides[name] = { primaryMuscle: null, secondaryMuscles: [], isMobility: false };
    gpCommit();
  }

  function setExerciseOverride(name, patch) {
    if (!name) return null;
    const current = gpData.exerciseOverrides[name];
    const merged = gpNormalizeOverride(name, Object.assign({}, current, patch || {}));
    gpData.exerciseOverrides[name] = merged;
    gpCommit();
    return merged;
  }

  function getAllKnownNames() {
    const names = {};
    Object.keys(seedExercises()).forEach(function (n) { names[n] = true; });
    Object.keys(gpData.exerciseOverrides).forEach(function (n) { names[n] = true; });
    return Object.keys(names).sort(function (a, b) { return a.localeCompare(b); });
  }

  function getExercisesByMuscle(muscle) {
    return getAllKnownNames()
      .map(function (name) { return Object.assign({ name: name }, getExerciseInfo(name)); })
      .filter(function (info) { return info.primaryMuscle === muscle || info.secondaryMuscles.indexOf(muscle) !== -1; });
  }

  // ---- The one place discard/mobility filtering happens — used by both
  // the Lyfta import handler and the manual Pesas/Movilidad log flow. ----
  // @param {string} date  "YYYY-MM-DD"
  // @param {Array<{name, sets:[{reps,weight}]}>} rawExercises
  // @returns {{ keptExercises: Array, mobilityEntries: Array }}
  function partitionWorkoutExercises(date, rawExercises) {
    const keptExercises = [];
    const mobilityEntries = [];
    (rawExercises || []).forEach(function (raw) {
      const name = (raw && raw.name || '').trim();
      const sets = (raw && Array.isArray(raw.sets)) ? raw.sets : [];
      if (!name || !sets.length) return;
      if (isDiscarded(name)) return;
      ensureExercise(name);
      const info = getExerciseInfo(name);
      if (info.isMobility) {
        sets.forEach(function (s) {
          mobilityEntries.push({ date: date, name: name, reps: (s && s.reps != null) ? s.reps : null });
        });
      } else {
        keptExercises.push({
          name: name,
          primaryMuscle: info.primaryMuscle,
          secondaryMuscles: info.secondaryMuscles,
          sets: sets.slice(),
        });
      }
    });
    return { keptExercises: keptExercises, mobilityEntries: mobilityEntries };
  }

  // ---- Muscle fatigue config ----
  function setMuscleFatigueConfig(config) {
    gpData.muscleFatigueConfig = config;
    gpCommit();
  }
  function getMuscleFatigueConfig() { return gpData.muscleFatigueConfig; }

  // ---- Mobility log ----
  function addMobilityLogEntry(entry) {
    const e = gpNormalizeMobilityEntry(entry);
    gpData.mobilityLog.push(e);
    gpCommit();
    return e;
  }
  function addMobilityLogEntries(entries) {
    if (!entries || !entries.length) return [];
    const added = entries.map(gpNormalizeMobilityEntry);
    gpData.mobilityLog = gpData.mobilityLog.concat(added);
    gpCommit();
    return added;
  }
  function getMobilityLog() {
    return gpData.mobilityLog.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }
  function deleteMobilityLogEntry(id) {
    gpData.mobilityLog = gpData.mobilityLog.filter(function (e) { return e.id !== id; });
    gpCommit();
  }

  // ---- Bulk export/import (Settings → Data), for users running fully
  // local/offline without Supabase configured. ----
  function exportSnapshot() {
    return JSON.parse(JSON.stringify(gpData));
  }
  function importSnapshot(raw) {
    gpData = gpNormalize(raw);
    gpCommit();
  }
  function resetAll() {
    gpData = gpDefault();
    gpCommit();
  }

  window.GymPesasStore = {
    getExerciseInfo: getExerciseInfo,
    isDiscarded: isDiscarded,
    ensureExercise: ensureExercise,
    setExerciseOverride: setExerciseOverride,
    getAllKnownNames: getAllKnownNames,
    getExercisesByMuscle: getExercisesByMuscle,
    partitionWorkoutExercises: partitionWorkoutExercises,
    getMuscleFatigueConfig: getMuscleFatigueConfig,
    setMuscleFatigueConfig: setMuscleFatigueConfig,
    addMobilityLogEntry: addMobilityLogEntry,
    addMobilityLogEntries: addMobilityLogEntries,
    getMobilityLog: getMobilityLog,
    deleteMobilityLogEntry: deleteMobilityLogEntry,
    exportSnapshot: exportSnapshot,
    importSnapshot: importSnapshot,
    resetAll: resetAll,
  };
})();
