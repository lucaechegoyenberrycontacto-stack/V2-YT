// Reusable period-comparison chart for the training module (gym.html).
// One implementation, used 3x: weights weekly volume, cardio minutes,
// running/bike distance. Hand-rolled SVG, same convention as the existing
// whRenderFrequency chart (viewBox 700x220, grid/bar/label sub-elements) —
// reuses its .wh-freq-grid/.wh-freq-yaxis-label/.wh-freq-label/.wh-freq-val
// classes for identical typography instead of duplicating them.
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

    const W = 700, H = 220;
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

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = grid + barsHtml;
  }

  window.renderPeriodComparisonChart = renderPeriodComparisonChart;
})();
