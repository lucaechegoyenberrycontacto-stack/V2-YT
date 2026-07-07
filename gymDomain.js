// Pure domain logic for the training module (gym.html) — no DOM, no
// localStorage, no fetch. Structural-diff detection, PR checks, and (in a
// later phase) period-comparison/streak math all live here so they can be
// reasoned about and tested independently of the UI.
(function () {
  // Compares the routine version used to START a session against the
  // exercises actually logged, by exercise ID + ORDER only. Weight/reps/
  // set-count differences are irrelevant here — that's normal progression,
  // never a structural change. Never trips on anything but exercises
  // added, removed, or reordered.
  //
  // @param {{exercises:[{exerciseId}]}} routineVersion  the version used to start the session (or null for a free session)
  // @param {string[]} sessionExerciseIds  exercise IDs in the order actually performed
  // @returns {{changed:boolean, added:string[], removed:string[], reordered:boolean}}
  function detectRoutineStructuralDiff(routineVersion, sessionExerciseIds) {
    const routineIds = ((routineVersion && routineVersion.exercises) || []).map(function (e) { return e.exerciseId; });
    const added = sessionExerciseIds.filter(function (id) { return routineIds.indexOf(id) === -1; });
    const removed = routineIds.filter(function (id) { return sessionExerciseIds.indexOf(id) === -1; });
    let reordered = false;
    if (!added.length && !removed.length) {
      reordered = routineIds.some(function (id, i) { return id !== sessionExerciseIds[i]; });
    }
    return {
      changed: added.length > 0 || removed.length > 0 || reordered,
      added: added,
      removed: removed,
      reordered: reordered,
    };
  }

  // Highest single-set weight ever logged for this exercise name, across
  // all prior workouts (before the set currently being checked).
  function checkWeightPR(exerciseName, weight, allWorkouts) {
    let best = 0;
    (allWorkouts || []).forEach(function (w) {
      (w.exercises || []).forEach(function (ex) {
        if (ex.name !== exerciseName) return;
        (ex.sets || []).forEach(function (s) { if ((s.weight || 0) > best) best = s.weight || 0; });
      });
    });
    return { isPR: weight > best, previousBest: best };
  }

  // Highest total volume (Σ weight×reps) for this exercise in a single
  // prior session, compared against the volume just completed this session.
  function checkVolumePR(exerciseName, sessionVolume, allWorkouts) {
    let best = 0;
    (allWorkouts || []).forEach(function (w) {
      (w.exercises || []).forEach(function (ex) {
        if (ex.name !== exerciseName) return;
        const vol = (ex.sets || []).reduce(function (sum, s) { return sum + (s.weight || 0) * (s.reps || 0); }, 0);
        if (vol > best) best = vol;
      });
    });
    return { isPR: sessionVolume > best, previousBest: best };
  }

  // Monday-starting week boundary for a given Date.
  function mondayOf(d) {
    const dow = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
    const m = new Date(d);
    m.setHours(0, 0, 0, 0);
    m.setDate(m.getDate() - dow);
    return m;
  }

  // The ONE function behind all 3 period-comparison charts (weights volume,
  // cardio minutes, run/bike distance) — Monday-starting "this week" vs the
  // full previous Mon-Sun week.
  // @param {Array} sessions
  // @param {(session)=>number} valueExtractor
  // @param {(session)=>boolean} [filterFn]
  // @returns {{thisWeek:number, lastWeek:number, deltaPct:number|null}}
  function computeWeekOverWeek(sessions, valueExtractor, filterFn) {
    const thisMonday = mondayOf(new Date());
    const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday); lastSunday.setDate(lastSunday.getDate() - 1); lastSunday.setHours(23, 59, 59, 999);

    let thisWeek = 0, lastWeek = 0;
    (sessions || []).forEach(function (w) {
      if (filterFn && !filterFn(w)) return;
      const d = new Date(w.date);
      if (isNaN(d.getTime())) return;
      const val = valueExtractor(w) || 0;
      if (d >= thisMonday) thisWeek += val;
      else if (d >= lastMonday && d <= lastSunday) lastWeek += val;
    });
    const deltaPct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : (thisWeek > 0 ? 100 : null);
    return { thisWeek: thisWeek, lastWeek: lastWeek, deltaPct: deltaPct };
  }

  // Consecutive days (today backwards) with >=1 session of ANY discipline.
  // Today doesn't break an in-progress streak before the day is over — if
  // today has no session yet, counting starts from yesterday.
  function computeTrainingStreak(sessions) {
    const days = {};
    (sessions || []).forEach(function (w) { if (w.date) days[w.date] = true; });
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (!days[cursor.toISOString().slice(0, 10)]) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (days[cursor.toISOString().slice(0, 10)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  window.GymDomain = {
    detectRoutineStructuralDiff: detectRoutineStructuralDiff,
    checkWeightPR: checkWeightPR,
    checkVolumePR: checkVolumePR,
    computeWeekOverWeek: computeWeekOverWeek,
    computeTrainingStreak: computeTrainingStreak,
  };
})();
