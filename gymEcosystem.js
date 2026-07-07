// Recovery "ecosystem" modifier for the muscle-fatigue map (gym.html):
// reads sleep/protein/screen-time signals from the OTHER dashboard pages'
// own localStorage keys (read-only, never written here) and turns them
// into a single daily multiplier applied to every muscle's recoveryHours
// equally. No DOM access — the 3 functions below are the only ones that
// touch localStorage; everything else here is pure number-in/number-out,
// so it's testable without mocking a full page.
//
// Deliberately reimplements health.html's durationHours() and
// nutrition.html's macrosFor() math locally (same result for the same
// inputs) instead of depending on those pages being loaded alongside
// gym.html.
(function () {
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function minutesSinceMidnight(hhmm) {
    if (!hhmm) return null;
    const parts = String(hhmm).split(':').map(Number);
    if (isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  }
  // Same math as health.html's durationHours — handles the bedtime→wake
  // crossing midnight.
  function durationHoursBetween(bedTime, wakeTime) {
    const b = minutesSinceMidnight(bedTime), w = minutesSinceMidnight(wakeTime);
    if (b == null || w == null) return null;
    let diff = w - b;
    if (diff <= 0) diff += 24 * 60;
    return diff / 60;
  }

  // @param {string} date "YYYY-MM-DD"
  // @returns {number|null} hours slept that date, or null if no sleepEntries row for it
  function getSleepHoursForDate(date) {
    const entries = readJSON('sleepEntries');
    if (!Array.isArray(entries)) return null;
    const entry = entries.find(function (e) { return e && e.date === date; });
    if (!entry) return null;
    return durationHoursBetween(entry.bedTime, entry.wakeTime);
  }

  function dayRangeMs(date) {
    const parts = String(date).split('-').map(Number);
    const start = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, 0, 0, 0, 0).getTime();
    return [start, start + 24 * 60 * 60 * 1000];
  }

  // @param {string} date "YYYY-MM-DD"
  // @returns {number|null} protein logged that date / nut:goals.protein, or
  //   null if no protein goal is configured or nothing was logged that date
  function getProteinRatioForDate(date) {
    const log = readJSON('nut:log');
    const foods = readJSON('nut:foods');
    const goals = readJSON('nut:goals');
    if (!Array.isArray(log) || !Array.isArray(foods) || !goals || !(goals.protein > 0)) return null;
    const range = dayRangeMs(date);
    const dayEntries = log.filter(function (l) { return l && l.ts >= range[0] && l.ts < range[1]; });
    if (!dayEntries.length) return null;
    let totalProtein = 0;
    dayEntries.forEach(function (entry) {
      (entry.items || []).forEach(function (it) {
        const f = foods.find(function (x) { return x && x.id === it.foodId; });
        if (!f) return;
        const scale = f.unit === 'unit' ? it.qty : it.qty / 100;
        totalProtein += (f.protein || 0) * scale;
      });
    });
    return totalProtein / goals.protein;
  }

  // @param {string} date "YYYY-MM-DD"
  // @returns {number|null} screen hours that date / goalHours, or null if
  //   no goal is set or nothing was logged that date
  function getScreenTimeRatioForDate(date) {
    const habits = readJSON('po_habits_v1');
    const screenTime = habits && habits.screenTime;
    if (!screenTime || !(screenTime.goalHours > 0)) return null;
    const hrs = screenTime.logs && screenTime.logs[date];
    if (hrs == null) return null;
    return Number(hrs) / screenTime.goalHours;
  }

  // Linear penalty between goodX (0 penalty) and poorX (maxPenalty),
  // clamped beyond either end. Direction-agnostic — works whether "good"
  // means a high value (sleep hours, protein ratio) or a low one (screen
  // time ratio), since goodX/poorX can be given in either order.
  function linearPenalty(value, goodX, poorX, maxPenalty) {
    if (value == null || isNaN(value) || goodX === poorX || !(maxPenalty > 0)) return 0;
    const frac = (value - goodX) / (poorX - goodX);
    return Math.max(0, Math.min(1, frac)) * maxPenalty;
  }

  // A single bad-everything day should never make recovery absurdly slow.
  const PENALTY_CAP = 0.6;
  const SIGNAL_LABELS = { sleep: 'sueño bajo', protein: 'proteína baja', screenTime: 'pantalla alta' };

  // The one place that reads all 3 signals and does the penalty math.
  // computeEcosystemModifier() and the muscle-map UI badge (which needs to
  // say WHY, not just by how much) are both thin wrappers around this.
  // @param {string} date "YYYY-MM-DD"
  // @param {Object} config  the full muscleFatigueConfig (reads config.ecosystem)
  function getEcosystemBreakdown(date, config) {
    const eco = config && config.ecosystem;
    if (!eco || eco.enabled === false) return { modifier: 1, penalties: {}, contributing: [] };

    const penalties = {};
    if (eco.sleep) penalties.sleep = linearPenalty(getSleepHoursForDate(date), eco.sleep.goodHours, eco.sleep.poorHours, eco.sleep.maxPenalty);
    if (eco.protein) penalties.protein = linearPenalty(getProteinRatioForDate(date), eco.protein.goodRatio, eco.protein.poorRatio, eco.protein.maxPenalty);
    if (eco.screenTime) penalties.screenTime = linearPenalty(getScreenTimeRatioForDate(date), eco.screenTime.goodRatioMax, eco.screenTime.poorRatioMax, eco.screenTime.maxPenalty);

    const contributing = Object.keys(penalties).filter(function (k) { return penalties[k] > 0; });
    const total = Math.min(PENALTY_CAP, contributing.reduce(function (sum, k) { return sum + penalties[k]; }, 0));
    return { modifier: 1 + total, penalties: penalties, contributing: contributing };
  }

  // @returns {number} multiplier >= 1.0 to apply to recoveryHours for `date`
  function computeEcosystemModifier(date, config) {
    return getEcosystemBreakdown(date, config).modifier;
  }

  function joinEs(items) {
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return items.join(' y ');
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
  }

  // @returns {string|null} a short UI line for TODAY's modifier, or null when neutral (1.0)
  function describeEcosystemModifier(date, config) {
    const b = getEcosystemBreakdown(date, config);
    if (b.modifier <= 1) return null;
    const pct = Math.round((b.modifier - 1) * 100);
    const labels = b.contributing.map(function (k) { return SIGNAL_LABELS[k] || k; });
    return 'Recuperación hoy: -' + pct + '% por ' + joinEs(labels);
  }

  window.GymEcosystem = {
    getSleepHoursForDate: getSleepHoursForDate,
    getProteinRatioForDate: getProteinRatioForDate,
    getScreenTimeRatioForDate: getScreenTimeRatioForDate,
    getEcosystemBreakdown: getEcosystemBreakdown,
    computeEcosystemModifier: computeEcosystemModifier,
    describeEcosystemModifier: describeEcosystemModifier,
  };
})();
