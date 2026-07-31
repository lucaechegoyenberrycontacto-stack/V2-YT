// Reusable period-comparison chart for the training module (gym.html).
// One implementation, used 3x: weights weekly volume, cardio minutes,
// running/bike distance. Hand-rolled SVG, same convention as the existing
// whRenderFrequency chart (viewBox width matches real rendered width, fixed
// 220 height, grid/bar/label sub-elements) — reuses its .wh-freq-grid/
// .wh-freq-yaxis-label/.wh-freq-label/.wh-freq-val classes for identical
// typography instead of duplicating them.
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * @param {SVGElement|string} target    An <svg> element, or its id.
   * @param {{thisPeriod:number, lastPeriod:number, unit?:string, thisLabel?:string, lastLabel?:string, deltaPct?:number|null}} opts
   */
  function renderPeriodComparisonChart(target, opts) {
    const svg = typeof target === 'string' ? document.getElementById(target) : target;
    if (!svg) return;
    opts = opts || {};
    const thisPeriod = Number(opts.thisPeriod) || 0;
    const lastPeriod = Number(opts.lastPeriod) || 0;
    const unit = opts.unit || '';
    const thisLabel = opts.thisLabel || 'Esta semana';
    const lastLabel = opts.lastLabel || 'Semana pasada';
    const deltaPct = (opts.deltaPct == null || isNaN(opts.deltaPct)) ? null : opts.deltaPct;

    // W matches the SVG's actual rendered pixel width (not a fixed unit) so
    // the internal coordinate system is always 1:1 with its on-screen size —
    // same technique as health.html's renderWeekChart. Avoids the squashed-
    // on-mobile distortion that preserveAspectRatio="none" used to paper over.
    const W = svg.getBoundingClientRect().width || 700, H = 220;
    // padTop has room for both the value label AND (when present) the
    // delta-% micro-label stacked above it, even when the current bar
    // reaches all the way up to niceMax.
    const padLeft = 40, padRight = 10, padTop = 32, padBottom = 30;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    const baseY = padTop + plotH;

    const rawMax = Math.max(thisPeriod, lastPeriod, 1);
    const step = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
    const niceMax = Math.ceil(rawMax / step) * step;

    let grid = '';
    for (let v = 0; v <= niceMax; v += step) {
      const y = baseY - (v / niceMax) * plotH;
      grid += '<line class="wh-freq-grid" x1="' + padLeft + '" y1="' + y.toFixed(1) + '" x2="' + (W - padRight).toFixed(1) + '" y2="' + y.toFixed(1) + '"></line>'
        + '<text class="wh-freq-yaxis-label" x="' + (padLeft - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    }

    const barW = plotW * 0.22;
    const gap = plotW * 0.14;
    const totalBarsW = barW * 2 + gap;
    const startX = padLeft + (plotW - totalBarsW) / 2;

    const bars = [
      { value: lastPeriod, x: startX, cls: 'tr-cmp-bar-prev', label: lastLabel },
      { value: thisPeriod, x: startX + barW + gap, cls: 'tr-cmp-bar-current', label: thisLabel },
    ];

    let barsHtml = '';
    bars.forEach(function (b, i) {
      const h = b.value > 0 ? Math.max(4, plotH * (b.value / niceMax)) : 0;
      const y = baseY - h;
      const valText = (Number.isInteger(b.value) ? b.value : b.value.toFixed(1)) + (unit ? ' ' + unit : '');
      barsHtml += '<rect class="tr-cmp-bar ' + b.cls + '" x="' + b.x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"></rect>';
      barsHtml += '<text class="wh-freq-val" x="' + (b.x + barW / 2).toFixed(1) + '" y="' + (y - 8).toFixed(1) + '" text-anchor="middle">' + escapeHtml(valText) + '</text>';
      barsHtml += '<text class="wh-freq-label" x="' + (b.x + barW / 2).toFixed(1) + '" y="' + (baseY + 20) + '" text-anchor="middle">' + escapeHtml(b.label) + '</text>';
      // Delta-% micro-label, current bar only (i===1), stacked above its value.
      if (i === 1 && deltaPct != null) {
        const sign = deltaPct >= 0 ? '+' : '';
        const cls = deltaPct >= 0 ? 'cht-delta-pos' : 'cht-delta-neg';
        barsHtml += '<text class="cht-delta ' + cls + '" x="' + (b.x + barW / 2).toFixed(1) + '" y="' + (y - 21).toFixed(1) + '" text-anchor="middle">' + sign + Math.round(deltaPct) + '%</text>';
      }
    });

    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H);
    svg.innerHTML = grid + barsHtml;
  }

  window.renderPeriodComparisonChart = renderPeriodComparisonChart;

  // Truncates a label so it fits the fixed-width row-label column instead
  // of overlapping the bars — SVG <text> has no native CSS text-overflow.
  // 15 chars is calibrated to LABEL_W (108) at 11px mono (~6.6px/char).
  function truncateLabel(s, maxChars) {
    maxChars = maxChars || 15;
    return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
  }

  /**
   * Horizontal bar chart — one row per muscle, sorted by set count
   * descending (most-trained first), with a shaded 10–20 sets/week
   * reference band (Schoenfeld, Ogborn & Krieger 2017) behind the bars.
   * @param {SVGElement|string} target        An <svg> element, or its id.
   * @param {Object<string, number>} setsByMuscle  { [muscle]: setsThisWeek }
   */
  function renderMuscleVolumeChart(target, setsByMuscle) {
    const svg = typeof target === 'string' ? document.getElementById(target) : target;
    if (!svg) return;
    const entries = Object.keys(setsByMuscle || {}).map(function (m) {
      return { muscle: m, value: Number(setsByMuscle[m]) || 0 };
    });
    entries.sort(function (a, b) { return b.value - a.value; });
    const n = entries.length;
    if (!n) return;

    const ROW_H = 28, LABEL_W = 108;
    const padTop = 26, padBottom = 24, padLeft = 4, padRight = 42;
    // W matches the SVG's actual rendered pixel width, same technique as
    // the other charts in this file — 1:1 coordinate system, no distortion.
    const W = svg.getBoundingClientRect().width || 700;
    const H = padTop + n * ROW_H + padBottom;

    const plotLeft = padLeft + LABEL_W;
    const plotW = Math.max(10, (W - padRight) - plotLeft);
    const plotBottom = padTop + n * ROW_H;

    // Same "nice max" rounding as renderPeriodComparisonChart above, but
    // floored at 20 so the reference band is always fully on-screen even
    // when nothing in the data reaches it.
    const rawMax = Math.max.apply(null, entries.map(function (e) { return e.value; }).concat([20]));
    const step = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
    const niceMax = Math.ceil(rawMax / step) * step;
    const xFor = function (v) { return plotLeft + (Math.min(v, niceMax) / niceMax) * plotW; };

    // Reference band, drawn first so the grid/bars layer on top of it.
    const bandX1 = xFor(10), bandX2 = xFor(20);
    let svgHtml = '<rect class="tr-mvol-band" x="' + bandX1.toFixed(1) + '" y="' + padTop + '" width="' + (bandX2 - bandX1).toFixed(1) + '" height="' + (n * ROW_H).toFixed(1) + '"></rect>'
      + '<text class="tr-mvol-band-label" x="' + ((bandX1 + bandX2) / 2).toFixed(1) + '" y="' + (padTop - 8) + '" text-anchor="middle">10–20 series/semana</text>';

    for (let v = 0; v <= niceMax; v += step) {
      const x = xFor(v);
      svgHtml += '<line class="wh-freq-grid" x1="' + x.toFixed(1) + '" y1="' + padTop + '" x2="' + x.toFixed(1) + '" y2="' + plotBottom.toFixed(1) + '"></line>'
        + '<text class="wh-freq-yaxis-label" x="' + x.toFixed(1) + '" y="' + (plotBottom + 16).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
    }

    entries.forEach(function (e, i) {
      const y = padTop + i * ROW_H;
      const barH = ROW_H - 10;
      const barY = y + (ROW_H - barH) / 2;
      const barW = Math.max(0, xFor(e.value) - plotLeft);
      // Below the 10-set floor = under-trained (amber); inside 10-20 = the
      // reference zone itself (green); above 20 = neutral, NOT a warning —
      // training a muscle more than the reference range isn't inherently bad.
      const cls = e.value < 10 ? 'tr-mvol-bar-low' : (e.value <= 20 ? 'tr-mvol-bar-ref' : 'tr-mvol-bar-high');
      const valText = Number.isInteger(e.value) ? e.value : e.value.toFixed(1);
      svgHtml += '<text class="wh-freq-label" x="' + (plotLeft - 8).toFixed(1) + '" y="' + (y + ROW_H / 2 + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(truncateLabel(e.muscle)) + '</text>'
        + '<rect class="' + cls + '" x="' + plotLeft.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="3"></rect>'
        + '<text class="wh-freq-val" x="' + (plotLeft + barW + 6).toFixed(1) + '" y="' + (y + ROW_H / 2 + 4).toFixed(1) + '" text-anchor="start">' + escapeHtml(String(valText)) + '</text>';
    });

    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
    // The shared .wh-freq-svg class fixes height at 220px for the OTHER 3
    // charts in this module (which always have a fixed-height viewBox), but
    // this one's viewBox height grows with the muscle-group row count (n
    // can be well past what fits in 220px). Without this override, the
    // default preserveAspectRatio="xMidYMid meet" uniformly downscales the
    // whole chart to fit inside that fixed 220px box — every row and label
    // shrinking to a fraction of its nominal size (measured: ~11px text
    // rendering at ~6px, i.e. exactly the "texto microscópico" bug). Setting
    // the actual rendered height to match H keeps the 1:1 scale the other
    // charts already get from their matched viewBox/CSS dimensions.
    svg.style.height = H.toFixed(1) + 'px';
    svg.innerHTML = svgHtml;
  }

  window.renderMuscleVolumeChart = renderMuscleVolumeChart;

  /**
   * 0-100 donut/ring for a single session's load score (GymDomain.
   * computeSessionLoad) — number centered, threshold label below, same
   * sweep-in motion as gym.html's stepsAnimateNumber (ease-out quad).
   * Color is a severity signal (green->amber->red as load climbs), unlike
   * the neutral tr-mvol-bar-high — a single session reading "Muy alta" is
   * actionable in a way a muscle group trained above the weekly reference
   * band isn't.
   * @param {SVGElement|string} target   An <svg> element, or its id.
   * @param {{score:number, label:string}} opts
   */
  function renderLoadRing(target, opts) {
    const svg = typeof target === 'string' ? document.getElementById(target) : target;
    if (!svg) return;
    opts = opts || {};
    const score = Math.max(0, Math.min(100, Number(opts.score) || 0));
    const label = opts.label || '';

    // Square, sized off the real rendered width — same 1:1 coordinate-system
    // technique as the other charts in this file.
    const W = svg.getBoundingClientRect().width || 160;
    const cx = W / 2, cy = W / 2;
    const r = W / 2 - 12;
    const circumference = 2 * Math.PI * r;
    const targetOffset = circumference * (1 - score / 100);
    const cls = score <= 25 ? 'tr-load-ring-arc-low'
      : score <= 50 ? 'tr-load-ring-arc-mid'
      : score <= 75 ? 'tr-load-ring-arc-high'
      : 'tr-load-ring-arc-veryhigh';

    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + W.toFixed(1));
    svg.innerHTML =
      '<circle class="tr-load-ring-track" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '"></circle>'
      + '<circle class="tr-load-ring-arc ' + cls + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" '
      +   'stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + circumference.toFixed(1) + '" '
      +   'transform="rotate(-90 ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')"></circle>'
      + '<text class="tr-load-ring-val" x="' + cx.toFixed(1) + '" y="' + (cy - 2).toFixed(1) + '" text-anchor="middle">0</text>'
      + '<text class="tr-load-ring-label" x="' + cx.toFixed(1) + '" y="' + (cy + 20).toFixed(1) + '" text-anchor="middle">' + escapeHtml(label) + '</text>';

    const arcEl = svg.querySelector('.tr-load-ring-arc');
    const valEl = svg.querySelector('.tr-load-ring-val');
    const start = performance.now(), duration = 500;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2);
      valEl.textContent = Math.round(score * eased);
      arcEl.setAttribute('stroke-dashoffset', (circumference - (circumference - targetOffset) * eased).toFixed(1));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.renderLoadRing = renderLoadRing;
})();
