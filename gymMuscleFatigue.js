// Pure muscle-fatigue scoring module for the training map (gym.html).
// No DOM access, no localStorage, no fetch — takes plain data in, returns
// plain data out. The UI (gymUI.js) decides how to render the result.
(function () {
  // PLACEHOLDER — replace with the user's real training documentation.
  // Every numeric value below is an illustrative example, not a verified
  // physiological fact. This object only ever ships as the seed value for
  // a brand-new gym_training_config row; the user's real config replaces
  // it wholesale (see `isPlaceholder`) once loaded.
  const DEFAULT_MUSCLE_FATIGUE_CONFIG = {
    isPlaceholder: true,
    version: 0,
    muscles: {},
    // PLACEHOLDER — how many "minutes of muscle-minutes" each cardio/martial-arts
    // subtype contributes per muscle, as a multiplier of session duration.
    // Invented for illustration only, not an exercise-science fact.
    cardioMuscleMap: {
      boxeo:    { 'Hombros': 0.6, 'Antebrazos': 0.5, 'Abdominales/Core': 0.4, 'Espalda alta': 0.3 },
      muaythai: { 'Cuádriceps': 0.5, 'Isquiotibiales': 0.4, 'Abdominales/Core': 0.5, 'Hombros': 0.4 },
      running:  { 'Cuádriceps': 0.6, 'Isquiotibiales': 0.5, 'Gemelos': 0.6, 'Glúteos': 0.4 },
      bici:     { 'Cuádriceps': 0.7, 'Isquiotibiales': 0.3, 'Gemelos': 0.4, 'Glúteos': 0.3 },
    },
  };
  (window.MUSCLE_GROUPS || []).forEach(function (m) {
    DEFAULT_MUSCLE_FATIGUE_CONFIG.muscles[m] = {
      recoveryHours: 48, // PLACEHOLDER — replace with the user's real doc
      weight: 1.0,       // PLACEHOLDER — relative contribution weight
    };
  });

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

    function addLoad(muscle, units, hoursAgo, dateStr) {
      if (!muscle || !muscles[muscle] || units <= 0) return;
      const cfg = (config.muscles && config.muscles[muscle]) || {};
      const recoveryHours = cfg.recoveryHours || 48;
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
