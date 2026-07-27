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
   * @param {{thisPeriod:number, lastPeriod:number, unit?:string, thisLabel?:string, lastLabel?:string}} opts
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

    // W matches the SVG's actual rendered pixel width (not a fixed unit) so
    // the internal coordinate system is always 1:1 with its on-screen size —
    // same technique as health.html's renderWeekChart. Avoids the squashed-
    // on-mobile distortion that preserveAspectRatio="none" used to paper over.
    const W = svg.getBoundingClientRect().width || 700, H = 220;
    const padLeft = 40, padRight = 10, padTop = 22, padBottom = 30;
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
    bars.forEach(function (b) {
      const h = b.value > 0 ? Math.max(4, plotH * (b.value / niceMax)) : 0;
      const y = baseY - h;
      const valText = (Number.isInteger(b.value) ? b.value : b.value.toFixed(1)) + (unit ? ' ' + unit : '');
      barsHtml += '<rect class="tr-cmp-bar ' + b.cls + '" x="' + b.x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"></rect>';
      barsHtml += '<text class="wh-freq-val" x="' + (b.x + barW / 2).toFixed(1) + '" y="' + (y - 8).toFixed(1) + '" text-anchor="middle">' + escapeHtml(valText) + '</text>';
      barsHtml += '<text class="wh-freq-label" x="' + (b.x + barW / 2).toFixed(1) + '" y="' + (baseY + 20) + '" text-anchor="middle">' + escapeHtml(b.label) + '</text>';
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
    svg.innerHTML = svgHtml;
  }

  window.renderMuscleVolumeChart = renderMuscleVolumeChart;
})();
