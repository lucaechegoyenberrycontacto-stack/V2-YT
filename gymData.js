// Data access layer for the multi-discipline training module (gym.html):
// exercise library, routines + append-only version history, and the
// muscle-fatigue config. Backed by the `gym_training_config` Supabase
// table (own debounced sync channel, same pattern as sync.js) — a
// separate concern from workout_history, which only holds the per-session
// log. Loaded after gymMuscleFatigue.js (uses its default config) and
// before gymUI.js (which consumes window.GymData).
(function () {
  const GT_LS_KEY = 'po_coach_training_config_v1';
  const GT_TABLE = 'gym_training_config';
  const GT_KEY = 'training_config';
  const SUPABASE_URL = (typeof window !== 'undefined' && window.DASH_SUPABASE_URL) || 'https://bkkjtxvneldsqwyhrhub.supabase.co';
  const SUPABASE_KEY = (typeof window !== 'undefined' && window.DASH_SUPABASE_KEY) || 'sb_publishable_G8LqREPRDk0_tMEJNSFBxA_mIXNAnmT';

  function gtUid(prefix) { return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 9999); }

  function gtDefaultConfig() {
    // Deep-clone so mutating the loaded config never touches the shared
    // module default in gymMuscleFatigue.js.
    return JSON.parse(JSON.stringify(window.DEFAULT_MUSCLE_FATIGUE_CONFIG || { isPlaceholder: true, muscles: {}, cardioMuscleMap: {} }));
  }
  function gtDefault() {
    return { exercises: [], routines: [], muscleFatigueConfig: gtDefaultConfig() };
  }

  function gtNormalizeRoutineVersion(v) {
    v = v || {};
    return {
      version: Number(v.version) || 1,
      date: v.date || new Date().toISOString().slice(0, 10),
      exercises: Array.isArray(v.exercises) ? v.exercises.map(function (ve) {
        ve = ve || {};
        return {
          exerciseId: ve.exerciseId || null,
          targetRepMin: ve.targetRepMin != null ? Number(ve.targetRepMin) : null,
          targetRepMax: ve.targetRepMax != null ? Number(ve.targetRepMax) : null,
          targetWeight: ve.targetWeight != null ? Number(ve.targetWeight) : null,
        };
      }) : [],
    };
  }
  function gtNormalize(raw) {
    raw = raw || {};
    return {
      exercises: Array.isArray(raw.exercises) ? raw.exercises.map(function (e) {
        e = e || {};
        return {
          id: e.id || gtUid('ex'),
          name: e.name || '',
          primaryMuscle: e.primaryMuscle || null,
          secondaryMuscles: Array.isArray(e.secondaryMuscles) ? e.secondaryMuscles.slice() : [],
        };
      }) : [],
      routines: Array.isArray(raw.routines) ? raw.routines.map(function (r) {
        r = r || {};
        return {
          id: r.id || gtUid('rt'),
          name: r.name || 'Routine',
          discipline: r.discipline || 'pesas',
          // Append-only. Nothing in this file ever removes an entry from
          // this array — bumpRoutineVersion is the only way it grows.
          versions: Array.isArray(r.versions) ? r.versions.map(gtNormalizeRoutineVersion) : [],
        };
      }) : [],
      muscleFatigueConfig: (raw.muscleFatigueConfig && typeof raw.muscleFatigueConfig === 'object')
        ? raw.muscleFatigueConfig
        : gtDefaultConfig(),
    };
  }

  function gtLoad() {
    try {
      const raw = localStorage.getItem(GT_LS_KEY);
      if (raw) return gtNormalize(JSON.parse(raw));
    } catch (e) {}
    return gtDefault();
  }
  function gtSaveLocal() {
    try { localStorage.setItem(GT_LS_KEY, JSON.stringify(gtData)); } catch (e) {}
  }
  let gtData = gtLoad();

  // ---- Debounced Supabase sync — same 250ms schedulePush pattern as
  // sync.js, adapted to this module's single-blob table. ----
  let gtSupa = null;
  let gtPushTimer = null;
  let gtLastSyncedJson = null;

  async function gtPushNow() {
    if (!gtSupa) return;
    const json = JSON.stringify(gtData);
    if (json === gtLastSyncedJson) return;
    try {
      const { error } = await gtSupa.from(GT_TABLE).upsert(
        { key: GT_KEY, data: gtData, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (!error) gtLastSyncedJson = json;
    } catch (e) {}
  }
  function gtSchedulePush() {
    clearTimeout(gtPushTimer);
    gtPushTimer = setTimeout(gtPushNow, 250);
  }
  function gtFlushOnUnload() {
    const json = JSON.stringify(gtData);
    if (json === gtLastSyncedJson || !SUPABASE_URL || !SUPABASE_KEY) return;
    try {
      fetch(SUPABASE_URL + '/rest/v1/' + GT_TABLE + '?on_conflict=key', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ key: GT_KEY, data: gtData, updated_at: new Date().toISOString() }),
        keepalive: true,
      }).catch(function () {});
      gtLastSyncedJson = json;
    } catch (e) {}
  }

  function gtCommit() {
    gtSaveLocal();
    if (typeof window.gtOnChange === 'function') { try { window.gtOnChange(gtData); } catch (e) {} }
    gtSchedulePush();
  }

  (async function gtInitCloudSync() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return;
    if (SUPABASE_URL.indexOf('PASTE-') === 0 || SUPABASE_KEY.indexOf('PASTE-') === 0) return;
    gtSupa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      const { data, error } = await gtSupa.from(GT_TABLE).select('data').eq('key', GT_KEY).maybeSingle();
      if (!error && data && data.data && typeof data.data === 'object') {
        gtData = gtNormalize(data.data);
        gtLastSyncedJson = JSON.stringify(gtData);
        gtSaveLocal();
        if (typeof window.gtOnChange === 'function') { try { window.gtOnChange(gtData); } catch (e) {} }
      } else if (gtData.exercises.length || gtData.routines.length) {
        gtPushNow();
      }
    } catch (e) {}
    try {
      gtSupa.channel('gym_training_config_' + GT_KEY)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: GT_TABLE, filter: 'key=eq.' + GT_KEY,
        }, function (payload) {
          if (!payload.new || !payload.new.data) return;
          const normalized = gtNormalize(payload.new.data);
          const incoming = JSON.stringify(normalized);
          if (incoming === gtLastSyncedJson) return;
          gtLastSyncedJson = incoming;
          gtData = normalized;
          gtSaveLocal();
          if (typeof window.gtOnChange === 'function') { try { window.gtOnChange(gtData); } catch (e) {} }
        })
        .subscribe();
    } catch (e) {}
  })();
  window.addEventListener('beforeunload', gtFlushOnUnload);
  window.addEventListener('pagehide', gtFlushOnUnload);

  // ---- Exercises ----
  function createExercise(input) {
    const ex = {
      id: gtUid('ex'),
      name: (input && input.name) || '',
      primaryMuscle: (input && input.primaryMuscle) || null,
      secondaryMuscles: (input && Array.isArray(input.secondaryMuscles)) ? input.secondaryMuscles.slice() : [],
    };
    gtData.exercises.push(ex);
    gtCommit();
    return ex;
  }
  function updateExercise(id, patch) {
    const ex = gtData.exercises.find(function (e) { return e.id === id; });
    if (!ex) return null;
    patch = patch || {};
    if (patch.name != null) ex.name = patch.name;
    if (patch.primaryMuscle != null) ex.primaryMuscle = patch.primaryMuscle;
    if (patch.secondaryMuscles != null) ex.secondaryMuscles = patch.secondaryMuscles.slice();
    gtCommit();
    return ex;
  }
  function deleteExercise(id) {
    gtData.exercises = gtData.exercises.filter(function (e) { return e.id !== id; });
    gtCommit();
  }
  function getExercises() { return gtData.exercises.slice(); }
  function getExercise(id) { return gtData.exercises.find(function (e) { return e.id === id; }) || null; }
  function getExercisesByMuscle(muscle) {
    return gtData.exercises.filter(function (e) {
      return e.primaryMuscle === muscle || (e.secondaryMuscles || []).indexOf(muscle) !== -1;
    });
  }

  // ---- Routines ----
  function createRoutine(input) {
    const rt = {
      id: gtUid('rt'),
      name: (input && input.name) || 'Routine',
      discipline: 'pesas',
      versions: [gtNormalizeRoutineVersion({
        version: 1,
        date: new Date().toISOString().slice(0, 10),
        exercises: (input && input.exercises) || [],
      })],
    };
    gtData.routines.push(rt);
    gtCommit();
    return rt;
  }
  // Renaming touches only the routine's own name, not a version snapshot —
  // never bumps the version.
  function updateRoutineName(id, name) {
    const rt = gtData.routines.find(function (r) { return r.id === id; });
    if (!rt) return null;
    rt.name = name;
    gtCommit();
    return rt;
  }
  // Append-only — creates version N+1 with the given exercise list. This is
  // the ONLY function in this module that grows a routine's `versions`
  // array; nothing here ever mutates or removes an existing version.
  function bumpRoutineVersion(routineId, newExercises) {
    const rt = gtData.routines.find(function (r) { return r.id === routineId; });
    if (!rt) return null;
    const lastVersion = rt.versions.length ? rt.versions[rt.versions.length - 1].version : 0;
    const v = gtNormalizeRoutineVersion({
      version: lastVersion + 1,
      date: new Date().toISOString().slice(0, 10),
      exercises: newExercises,
    });
    rt.versions.push(v);
    gtCommit();
    return v;
  }
  function deleteRoutine(id) {
    gtData.routines = gtData.routines.filter(function (r) { return r.id !== id; });
    gtCommit();
  }
  function getRoutines() { return gtData.routines.slice(); }
  function getRoutine(id) { return gtData.routines.find(function (r) { return r.id === id; }) || null; }
  function getRoutineCurrentVersion(routineId) {
    const rt = gtData.routines.find(function (r) { return r.id === routineId; });
    if (!rt || !rt.versions.length) return null;
    return rt.versions[rt.versions.length - 1];
  }

  // ---- Muscle fatigue config ----
  function setMuscleFatigueConfig(config) {
    gtData.muscleFatigueConfig = config;
    gtCommit();
  }
  function getMuscleFatigueConfig() { return gtData.muscleFatigueConfig; }

  // ---- Bulk export/import (Settings → Data), for users running fully
  // local/offline without Supabase configured. ----
  function exportSnapshot() {
    return JSON.parse(JSON.stringify(gtData));
  }
  function importSnapshot(raw) {
    gtData = gtNormalize(raw);
    gtCommit();
  }
  function resetAll() {
    gtData = gtDefault();
    gtCommit();
  }

  window.GymData = {
    getExercises: getExercises,
    getExercise: getExercise,
    getExercisesByMuscle: getExercisesByMuscle,
    createExercise: createExercise,
    updateExercise: updateExercise,
    deleteExercise: deleteExercise,
    getRoutines: getRoutines,
    getRoutine: getRoutine,
    createRoutine: createRoutine,
    updateRoutineName: updateRoutineName,
    bumpRoutineVersion: bumpRoutineVersion,
    deleteRoutine: deleteRoutine,
    getRoutineCurrentVersion: getRoutineCurrentVersion,
    getMuscleFatigueConfig: getMuscleFatigueConfig,
    setMuscleFatigueConfig: setMuscleFatigueConfig,
    exportSnapshot: exportSnapshot,
    importSnapshot: importSnapshot,
    resetAll: resetAll,
  };
})();
