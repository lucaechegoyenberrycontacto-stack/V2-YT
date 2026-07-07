// Pure muscle-fatigue scoring module for the training map (gym.html).
// No DOM access, no localStorage, no fetch — takes plain data in, returns
// plain data out. The UI (gymUI.js) decides how to render the result.
(function () {
  // Real config — recoveryHours/weight per muscle are standard strength-
  // training reference ranges (bigger/compound-heavy groups take longer
  // than small/isolated ones), assuming average fitness — a starting
  // point the user can edit later (same "Cargar configuración" modal as
  // before), not medical prescription or a value verified for any one
  // individual. cardioMuscleMap is unchanged from the previous placeholder.
  // The ecosystem block (sleep/protein/screen-time daily modifier) is
  // consumed by computeMuscleFatigue below via gymEcosystem.js — this
  // file only defines the per-muscle base values and the ecosystem
  // thresholds, not the modifier math itself.
  const DEFAULT_MUSCLE_FATIGUE_CONFIG = {
    isPlaceholder: false,
    version: 1,
    muscles: {
      'Pecho':            { recoveryHours: 72, weight: 1.0 },
      'Espalda alta':     { recoveryHours: 72, weight: 1.0 },
      'Espalda baja':     { recoveryHours: 96, weight: 1.0 },
      'Hombros':          { recoveryHours: 48, weight: 1.0 },
      'Bíceps':           { recoveryHours: 48, weight: 1.0 },
      'Tríceps':          { recoveryHours: 48, weight: 1.0 },
      'Antebrazos':       { recoveryHours: 36, weight: 1.0 },
      'Abdominales/Core': { recoveryHours: 36, weight: 1.0 },
      'Cuádriceps':       { recoveryHours: 72, weight: 1.0 },
      'Isquiotibiales':   { recoveryHours: 72, weight: 1.0 },
      'Glúteos':          { recoveryHours: 72, weight: 1.0 },
      'Gemelos':          { recoveryHours: 48, weight: 1.0 },
      'Cuello':           { recoveryHours: 48, weight: 1.0 },
    },
    cardioMuscleMap: {
      boxeo:    { 'Hombros': 0.6, 'Antebrazos': 0.5, 'Abdominales/Core': 0.4, 'Espalda alta': 0.3 },
      muaythai: { 'Cuádriceps': 0.5, 'Isquiotibiales': 0.4, 'Abdominales/Core': 0.5, 'Hombros': 0.4 },
      running:  { 'Cuádriceps': 0.6, 'Isquiotibiales': 0.5, 'Gemelos': 0.6, 'Glúteos': 0.4 },
      bici:     { 'Cuádriceps': 0.7, 'Isquiotibiales': 0.3, 'Gemelos': 0.4, 'Glúteos': 0.3 },
    },
    // Daily multiplier (>=1.0), applied EQUALLY to every muscle's
    // recoveryHours for sessions logged on a given date — never
    // differentiated per muscle. Each signal contributes 1.0 (neutral)
    // when there's no data for that date; see gymEcosystem.js.
    ecosystem: {
      enabled: true,
      sleep:      { goodHours: 7.5, poorHours: 5.5, maxPenalty: 0.25 },
      protein:    { goodRatio: 0.9, poorRatio: 0.5, maxPenalty: 0.20 },
      screenTime: { goodRatioMax: 1.0, poorRatioMax: 2.0, maxPenalty: 0.15 },
    },
  };

  /**
   * @param {Array} sessions  Normalized workout_history entries (window.WH.getAllWorkouts()).
   * @param {Object} config   muscleFatigueConfig — see DEFAULT_MUSCLE_FATIGUE_CONFIG shape.
   * @param {Date}   [now]    Injected for testability; defaults to current time.
   * @returns {{ isPlaceholder: boolean, muscles: Object<string, {score:number, lastTrainedAt:string|null}> }}
   */
  function computeMuscleFatigue(sessions, config, now) {
    now = now || new Date();
    const groups = window.MUSCLE_GROUPS || [];
    const muscles = {};
    groups.forEach(function (m) { muscles[m] = { score: 0, lastTrainedAt: null }; });

    // While no real config has been loaded yet, never invent colors/numbers —
    // the caller renders the empty/gray state instead of reading `muscles`.
    const isPlaceholder = !config || config.isPlaceholder !== false;
    if (isPlaceholder) return { isPlaceholder: true, muscles: muscles };

    // The ecosystem modifier only depends on the session's date, not the
    // exercise/muscle — cache per date so a multi-exercise session only
    // triggers the sleep/protein/screen-time lookups once.
    const ecoModifierCache = {};
    function ecoModifierFor(dateStr) {
      if (!(dateStr in ecoModifierCache)) {
        ecoModifierCache[dateStr] = (window.GymEcosystem && window.GymEcosystem.computeEcosystemModifier)
          ? window.GymEcosystem.computeEcosystemModifier(dateStr, config)
          : 1;
      }
      return ecoModifierCache[dateStr];
    }

    function addLoad(muscle, units, hoursAgo, dateStr) {
      if (!muscle || !muscles[muscle] || units <= 0) return;
      const cfg = (config.muscles && config.muscles[muscle]) || {};
      const baseRecoveryHours = cfg.recoveryHours || 48;
      const recoveryHours = baseRecoveryHours * ecoModifierFor(dateStr);
      const weight = cfg.weight != null ? cfg.weight : 1;
      const remainingFrac = Math.max(0, 1 - hoursAgo / recoveryHours);
      if (remainingFrac <= 0) return;
      const contribution = Math.min(100, units * 20 * weight) * remainingFrac;
      muscles[muscle].score = Math.min(100, muscles[muscle].score + contribution);
      if (!muscles[muscle].lastTrainedAt || dateStr > muscles[muscle].lastTrainedAt) {
        muscles[muscle].lastTrainedAt = dateStr;
      }
    }

    const cardioMuscleMap = config.cardioMuscleMap || {};
    (sessions || []).forEach(function (w) {
      const sessionDate = new Date(w.date);
      if (isNaN(sessionDate.getTime())) return;
      const hoursAgo = (now - sessionDate) / 3600000;
      if (hoursAgo < 0) return; // future-dated entry, ignore

      if (w.cardio) {
        const map = cardioMuscleMap[w.cardio.subtype] || {};
        Object.keys(map).forEach(function (muscle) {
          addLoad(muscle, (w.cardio.duration || 0) * map[muscle], hoursAgo, w.date);
        });
      } else {
        (w.exercises || []).forEach(function (ex) {
          const setCount = (ex.sets || []).length;
          if (!setCount) return;
          addLoad(ex.primaryMuscle, setCount, hoursAgo, w.date);
          (ex.secondaryMuscles || []).forEach(function (m) {
            addLoad(m, setCount * 0.5, hoursAgo, w.date);
          });
        });
      }
    });

    return { isPlaceholder: false, muscles: muscles };
  }

  window.computeMuscleFatigue = computeMuscleFatigue;
  window.DEFAULT_MUSCLE_FATIGUE_CONFIG = DEFAULT_MUSCLE_FATIGUE_CONFIG;
})();
