// UI layer for the multi-discipline training module (gym.html). Loaded
// after the page's main inline <script> closes, so window.WH (the bridge
// into the existing workout_history pipeline) and window.GymPesasStore
// are already defined.
(function () {
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Toast / celebration (reusable — PR celebrations reuse this as-is) ----
  let toastTimer = null;
  function showToast(message, opts) {
    opts = opts || {};
    let el = $('trToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'trToast';
      el.className = 'tr-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('tr-toast-celebrate', !!opts.celebrate);
    el.classList.remove('tr-toast-show');
    void el.offsetWidth; // force reflow so re-triggering shortly after still re-animates
    el.classList.add('tr-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('tr-toast-show'); }, opts.duration || 2600);
  }

  // ---- One-tap button group — shared 1-5 intensity scale, same options
  // feeding both Boxeo/MuayThai's "Dificultad percibida" (cardio.difficulty)
  // and Pesas' "Intensidad" (sessionMetrics.intensity). One label set so the
  // scale reads the same regardless of discipline; the values are what
  // gymMuscleFatigue.js's intensityMultiplier keys off. ----
  const DIFFICULTY_OPTIONS = [
    { value: 1, label: '1 · Suave' },
    { value: 2, label: '2 · Ligero' },
    { value: 3, label: '3 · Medio' },
    { value: 4, label: '4 · Duro' },
    { value: 5, label: '5 · Máximo' },
  ];

  function renderButtonGroup(container, options, selectedValue, onSelect) {
    if (!container) return;
    container.innerHTML = options.map(function (o) {
      const active = o.value === selectedValue;
      return '<button type="button" class="tr-effort-btn' + (active ? ' active' : '') + '" data-value="' + o.value + '">' + o.label + '</button>';
    }).join('');
    container.querySelectorAll('.tr-effort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.tr-effort-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const raw = btn.dataset.value;
        const isNumeric = options.every(function (o) { return typeof o.value === 'number'; });
        onSelect(isNumeric ? Number(raw) : raw);
      });
    });
  }

  window.showToast = showToast;
  window.renderButtonGroup = renderButtonGroup;
  window.DIFFICULTY_OPTIONS = DIFFICULTY_OPTIONS;

  // ---- Reusable date picker (Hoy / Ayer / Elegir fecha) ----
  // Moved to datePicker.js (Fase 4) so po-water.html can reuse it without
  // loading this whole gym-domain-specific file. window.createDatePicker
  // and its dp* helpers now come from that shared script (loaded before
  // this one in gym.html) — same function, same call signature, unchanged
  // behavior for every call site below.

  // ============================================================
  // MUSCLE MAP — anatomical front/back body silhouette (Lyfta-style: a
  // continuous human outline with muscles as shapes cut out inside it,
  // not floating primitives). Every region shape lives on one shared
  // coordinate system so toggling Frente/Espalda never jumps the figure
  // around. Hombros and Cuello are intentionally duplicated across both
  // views (visible from front and back, same score/color in both) —
  // union the front-only + back-only + shared regions and it's exactly
  // the 13-entry window.MUSCLE_GROUPS enum, once each. Region shapes
  // never hardcode a muscle list of their own beyond what's already in
  // that enum.
  //
  // Shape data origin: polygon coordinates adapted from
  // react-body-highlighter (github.com/giavinh79/react-body-highlighter),
  // MIT License, Copyright (c) 2020 GV79 — itself built from the SVG
  // polygons of react-native-body-highlighter. Points were copied as-is
  // (rounded to 2 decimals) from that library's `anteriorData`/
  // `posteriorData` and its own "0 0 100 200" viewBox, then regrouped
  // under our 13 Spanish muscle names below. Three adaptations from the
  // source library, since its muscle set doesn't line up 1:1 with ours:
  //   - Its separate "abductors" (front outer-thigh) and "adductor" (back
  //     inner-thigh) shapes have no equivalent in MUSCLE_GROUPS, so they're
  //     folded into the adjacent group they visually belong to (front outer
  //     thigh → Cuádriceps, back inner thigh → Isquiotibiales) rather than
  //     invented as new categories or left as unpainted gaps.
  //   - It has no dedicated posterior neck polygon, so Cuello's back-view
  //     shape reuses its anterior neck polygon verbatim (same coordinate
  //     system, and the neck reads about the same width/position from
  //     front or back in this flat illustration style).
  //   - "head", "knees" and the front-view triceps sliver/calves shapes
  //     don't correspond to any of our 13 groups either; they're kept as
  //     non-interactive BODY_*_DECO fill so the silhouette still reads as
  //     a complete body, same role the old ellipse-based head/hands/feet
  //     deco shapes played.
  // ============================================================
  const BODY_VIEWBOX = '-4 -4 108 230';

  // Non-interactive shapes that exist purely so the figure reads as a
  // continuous human silhouette instead of floating disconnected blobs —
  // never tied to a muscle, never focusable.
  const BODY_FRONT_DECO = [
    { tag: 'polygon', attrs: { points: '42.45 2.86 40 11.84 42.04 19.59 46.12 23.27 49.8 25.31 54.69 22.45 57.55 19.18 59.18 10.2 57.14 2.45 49.8 0' } }, // head
    { tag: 'polygon', attrs: { points: '69.39 55.51 69.39 61.63 75.92 72.65 77.55 70.2 75.51 67.35' } }, // triceps sliver — Tríceps is back-only
    { tag: 'polygon', attrs: { points: '22.45 69.39 29.8 55.51 29.8 60.82 22.86 73.06' } },
    { tag: 'polygon', attrs: { points: '33.88 140 34.69 143.27 35.51 147.35 36.33 151.02 35.1 156.73 29.8 156.73 27.35 152.65 27.35 147.35 30.2 144.08' } }, // knees
    { tag: 'polygon', attrs: { points: '65.71 140 72.24 147.76 72.24 152.24 69.8 157.14 64.9 156.73 62.86 151.02' } },
    { tag: 'polygon', attrs: { points: '71.43 160.41 73.47 153.47 76.73 161.22 79.59 167.76 78.37 187.76 79.59 195.51 74.69 195.51' } }, // lower legs — Gemelos is back-only
    { tag: 'polygon', attrs: { points: '24.9 194.69 27.76 164.9 28.16 160.41 26.12 154.29 24.9 157.55 22.45 161.63 20.82 167.76 22.04 188.16 20.82 195.51' } },
    { tag: 'polygon', attrs: { points: '72.65 195.1 69.8 159.18 65.31 158.37 64.08 162.45 64.08 165.31 65.71 177.14' } },
    { tag: 'polygon', attrs: { points: '35.51 158.37 35.92 162.45 35.92 166.94 35.1 172.24 35.1 176.73 32.24 182.04 30.61 187.35 26.94 194.69 27.35 187.76 28.16 180.41 28.57 175.51 28.98 169.8 29.8 164.08 30.2 158.78' } },
  ];

  const BODY_FRONT_REGIONS = [
    { muscle: 'Cuello', tag: 'polygon', attrs: { points: '55.51 23.67 50.61 33.47 50.61 39.18 61.63 40 70.61 44.9 69.39 36.73 63.27 35.1 58.37 30.61' } },
    { muscle: 'Cuello', tag: 'polygon', attrs: { points: '28.98 44.9 30.2 37.14 36.33 35.1 41.22 30.2 44.49 24.49 48.98 33.88 48.57 39.18 37.96 39.59' } },
    { muscle: 'Hombros', tag: 'polygon', attrs: { points: '78.37 53.06 79.59 47.76 79.18 41.22 75.92 37.96 71.02 36.33 72.24 42.86 71.43 47.35' } },
    { muscle: 'Hombros', tag: 'polygon', attrs: { points: '28.16 47.35 21.22 53.06 20 47.76 20.41 40.82 24.49 37.14 28.57 37.14 26.94 43.27' } },
    { muscle: 'Pecho', tag: 'polygon', attrs: { points: '51.84 41.63 51.02 55.1 57.96 57.96 67.76 55.51 70.61 47.35 62.04 41.63' } },
    { muscle: 'Pecho', tag: 'polygon', attrs: { points: '29.8 46.53 31.43 55.51 40.82 57.96 48.16 55.1 47.76 42.04 37.55 42.04' } },
    { muscle: 'Bíceps', tag: 'polygon', attrs: { points: '16.73 68.16 17.96 71.43 22.86 66.12 28.98 53.88 27.76 49.39 20.41 55.92' } },
    { muscle: 'Bíceps', tag: 'polygon', attrs: { points: '71.43 49.39 70.2 54.69 76.33 66.12 81.63 71.84 82.86 68.98 78.78 55.51' } },
    { muscle: 'Antebrazos', tag: 'polygon', attrs: { points: '6.12 88.57 10.2 75.1 14.69 70.2 16.33 74.29 19.18 73.47 4.49 97.55 0 100' } },
    { muscle: 'Antebrazos', tag: 'polygon', attrs: { points: '84.49 69.8 83.27 73.47 80 73.06 95.1 98.37 100 100.41 93.47 89.39 89.8 76.33' } },
    { muscle: 'Antebrazos', tag: 'polygon', attrs: { points: '77.55 72.24 77.55 77.55 80.41 84.08 85.31 89.8 92.24 101.22 94.69 99.59' } },
    { muscle: 'Antebrazos', tag: 'polygon', attrs: { points: '6.94 101.22 13.47 90.61 18.78 84.08 21.63 77.14 21.22 71.84 4.9 98.78' } },
    { muscle: 'Abdominales/Core', tag: 'polygon', attrs: { points: '56.33 59.18 57.96 64.08 58.37 77.96 58.37 92.65 56.33 98.37 55.1 104.08 51.43 107.76 51.02 84.49 50.61 67.35 51.02 57.14' } },
    { muscle: 'Abdominales/Core', tag: 'polygon', attrs: { points: '43.67 58.78 48.57 57.14 48.98 67.35 48.57 84.49 48.16 107.35 44.49 103.67 40.82 91.43 40.82 78.37 41.22 64.49' } },
    { muscle: 'Abdominales/Core', tag: 'polygon', attrs: { points: '68.57 63.27 67.35 57.14 58.78 59.59 60 64.08 60.41 83.27 65.71 78.78 66.53 69.8' } },
    { muscle: 'Abdominales/Core', tag: 'polygon', attrs: { points: '33.88 78.37 33.06 71.84 31.02 63.27 32.24 57.14 40.82 59.18 39.18 63.27 39.18 83.67' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '34.69 98.78 37.14 108.16 37.14 127.76 34.29 137.14 31.02 132.65 29.39 120 28.16 111.43 29.39 100.82 32.24 94.69' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '63.27 105.71 64.49 100 66.94 94.69 70.2 101.22 71.02 111.84 68.16 133.06 65.31 137.55 62.45 128.57 62.04 111.43' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '38.78 129.39 38.37 112.24 41.22 118.37 44.49 129.39 42.86 135.1 40 146.12 36.33 146.53 35.51 140' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '59.59 145.71 55.51 128.98 60.82 113.88 61.22 130.2 64.08 139.59 62.86 146.53' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '32.65 138.37 26.53 145.71 25.71 136.73 25.71 127.35 26.94 114.29 29.39 133.47' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '71.84 113.06 73.88 124.08 73.88 140.41 72.65 145.71 66.53 138.37 70.2 133.47' } },
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '52.65 110.2 54.29 124.9 60 110.2 62.04 100 64.9 94.29 60 92.65 56.73 104.49' } }, // outer thigh (source lib's "abductors") folded in — no matching group of its own
    { muscle: 'Cuádriceps', tag: 'polygon', attrs: { points: '47.76 110.61 44.9 125.31 42.04 115.92 40.41 113.06 39.59 107.35 37.96 102.45 34.69 93.88 39.59 92.24 41.63 99.18 43.67 105.31' } },
  ];

  const BODY_BACK_DECO = [
    { tag: 'polygon', attrs: { points: '50.64 0 45.96 0.85 40.85 5.53 40.43 12.77 45.11 20 55.74 20 59.15 13.62 59.57 4.68 55.74 1.28' } }, // head
    { tag: 'polygon', attrs: { points: '34.47 153.19 31.06 159.15 33.62 166.38 37.45 162.55' } }, // knees
    { tag: 'polygon', attrs: { points: '66.38 153.62 62.98 162.98 66.81 166.38 69.36 159.15' } },
    { tag: 'polygon', attrs: { points: '86.38 75.74 91.06 83.4 93.19 94.04 100 106.38 96.17 104.26 88.09 89.36 84.26 83.83' } }, // forearms — Antebrazos is front-only
    { tag: 'polygon', attrs: { points: '13.62 75.74 8.94 83.83 6.81 93.62 0 106.38 3.83 104.26 12.34 88.51 15.74 82.98' } },
    { tag: 'polygon', attrs: { points: '81.28 79.57 77.45 77.87 79.15 84.68 91.06 103.83 93.19 108.94 94.47 104.68' } },
    { tag: 'polygon', attrs: { points: '18.72 79.57 22.13 77.87 20.85 84.26 9.36 102.98 6.81 108.51 5.11 104.68' } },
  ];

  const BODY_BACK_REGIONS = [
    // Reused from the anterior NECK shape verbatim — see the origin note
    // above the BODY_VIEWBOX comment block.
    { muscle: 'Cuello', tag: 'polygon', attrs: { points: '55.51 23.67 50.61 33.47 50.61 39.18 61.63 40 70.61 44.9 69.39 36.73 63.27 35.1 58.37 30.61' } },
    { muscle: 'Cuello', tag: 'polygon', attrs: { points: '28.98 44.9 30.2 37.14 36.33 35.1 41.22 30.2 44.49 24.49 48.98 33.88 48.57 39.18 37.96 39.59' } },
    { muscle: 'Espalda alta', tag: 'polygon', attrs: { points: '44.68 21.7 47.66 21.7 47.23 38.3 47.66 64.68 38.3 53.19 35.32 40.85 31.06 36.6 39.15 33.19 43.83 27.23' } },
    { muscle: 'Espalda alta', tag: 'polygon', attrs: { points: '52.34 21.7 55.74 21.7 56.6 27.23 60.85 32.77 68.94 36.6 64.68 40.43 61.7 53.19 52.34 64.68 53.19 38.3' } },
    { muscle: 'Espalda alta', tag: 'polygon', attrs: { points: '31.06 38.72 28.09 48.94 28.51 55.32 34.04 75.32 47.23 71.06 47.23 66.38 36.6 54.04 33.62 41.28' } },
    { muscle: 'Espalda alta', tag: 'polygon', attrs: { points: '68.94 38.72 71.91 49.36 71.49 56.17 65.96 75.32 52.77 71.06 52.77 66.38 63.4 54.47 66.38 41.7' } },
    { muscle: 'Hombros', tag: 'polygon', attrs: { points: '29.36 37.02 22.98 39.15 17.45 44.26 18.3 53.62 24.26 49.36 27.23 46.38' } },
    { muscle: 'Hombros', tag: 'polygon', attrs: { points: '71.06 37.02 78.3 39.57 82.55 44.68 81.7 53.62 74.89 48.94 72.34 45.11' } },
    { muscle: 'Espalda baja', tag: 'polygon', attrs: { points: '47.66 72.77 34.47 77.02 35.32 83.4 49.36 102.13 46.81 82.98' } },
    { muscle: 'Espalda baja', tag: 'polygon', attrs: { points: '52.34 72.77 65.53 77.02 64.68 83.4 50.64 102.13 53.19 83.83' } },
    { muscle: 'Tríceps', tag: 'polygon', attrs: { points: '26.81 49.79 17.87 55.74 14.47 72.34 16.6 81.7 21.7 63.83 26.81 55.74' } },
    { muscle: 'Tríceps', tag: 'polygon', attrs: { points: '73.62 50.21 82.13 55.74 85.96 73.19 83.4 82.13 77.87 62.98 73.19 55.74' } },
    { muscle: 'Tríceps', tag: 'polygon', attrs: { points: '26.81 58.3 26.81 68.51 22.98 75.32 19.15 77.45 22.55 65.53' } },
    { muscle: 'Tríceps', tag: 'polygon', attrs: { points: '72.77 58.3 77.02 64.68 80.43 77.45 76.6 75.32 72.77 68.94' } },
    { muscle: 'Glúteos', tag: 'polygon', attrs: { points: '44.68 99.57 30.21 108.51 29.79 118.72 31.49 125.96 47.23 121.28 49.36 114.89' } },
    { muscle: 'Glúteos', tag: 'polygon', attrs: { points: '55.32 99.15 51.06 114.47 52.34 120.85 68.09 125.96 69.79 119.15 69.36 108.51' } },
    { muscle: 'Isquiotibiales', tag: 'polygon', attrs: { points: '28.94 122.13 31.06 129.36 36.6 125.96 35.32 135.32 34.47 150.21 29.36 158.3 28.94 146.81 27.66 141.28 27.23 131.49' } },
    { muscle: 'Isquiotibiales', tag: 'polygon', attrs: { points: '71.49 121.7 69.36 128.94 63.83 125.96 65.53 136.6 66.38 150.21 71.06 158.3 71.49 147.66 72.77 142.13 73.62 131.91' } },
    { muscle: 'Isquiotibiales', tag: 'polygon', attrs: { points: '38.72 125.53 44.26 145.96 40.43 166.81 36.17 152.77 37.02 135.32' } },
    { muscle: 'Isquiotibiales', tag: 'polygon', attrs: { points: '61.7 125.53 63.4 136.17 64.26 153.19 60 166.81 56.17 146.38' } },
    { muscle: 'Isquiotibiales', tag: 'polygon', attrs: { points: '48.09 122.98 44.68 122.98 41.28 125.53 45.11 144.26 48.51 135.74 48.94 129.36' } }, // inner thigh (source lib's "adductor") folded in — no matching group of its own
    { muscle: 'Isquiotibiales', tag: 'polygon', attrs: { points: '51.91 122.55 55.74 123.4 59.15 125.96 54.89 144.26 51.91 136.17 51.06 129.36' } },
    { muscle: 'Gemelos', tag: 'polygon', attrs: { points: '29.36 160.43 28.51 167.23 24.68 179.57 23.83 192.77 25.53 197.02 28.51 193.19 29.79 180 31.91 171.06 31.91 166.81' } },
    { muscle: 'Gemelos', tag: 'polygon', attrs: { points: '37.45 165.11 35.32 167.66 33.19 171.91 31.06 180.43 30.21 191.91 34.04 200 38.72 190.64 39.15 168.94' } },
    { muscle: 'Gemelos', tag: 'polygon', attrs: { points: '62.98 165.11 61.28 168.51 61.7 190.64 66.38 199.57 70.64 191.91 68.94 179.57 66.81 170.21' } },
    { muscle: 'Gemelos', tag: 'polygon', attrs: { points: '70.64 160.43 72.34 168.51 75.74 179.15 76.6 192.77 74.47 196.6 72.34 193.62 70.64 179.57 68.09 168.09' } },
    { muscle: 'Gemelos', tag: 'polygon', attrs: { points: '28.51 195.74 30.21 195.74 33.62 201.7 30.64 220 28.51 213.62 26.81 198.3' } }, // soleus, grouped under Gemelos (colloquial "pantorrillas/gemelos" covers both)
    { muscle: 'Gemelos', tag: 'polygon', attrs: { points: '69.79 195.74 71.91 195.74 73.62 198.3 71.91 213.19 70.21 219.57 67.23 202.13' } },
  ];

  function svgTag(tag, attrs) {
    let out = '<' + tag;
    Object.keys(attrs).forEach(function (k) { out += ' ' + k + '="' + attrs[k] + '"'; });
    return out + '></' + tag + '>';
  }

  function bodyDecoHtml(deco) {
    return deco.map(function (d) {
      return svgTag(d.tag, Object.assign({}, d.attrs, { class: 'tr-body-deco', 'aria-hidden': 'true' }));
    }).join('');
  }

  function bodyRegionsHtml(regions) {
    return regions.map(function (r) {
      return svgTag(r.tag, Object.assign({}, r.attrs, {
        class: 'tr-body-region', 'data-muscle': escapeHtml(r.muscle), role: 'button', tabindex: '0',
      }));
    }).join('');
  }

  // Legend chips mirror fatigueBodyFill's 4 outcomes one-to-one — colors
  // come from the CSS classes below (same --text-tertiary/--success/
  // --warning/--danger tokens fatigueBodyFill uses), never from a second
  // copy of the score thresholds, so legend and body can't drift apart.
  const MUSCLE_LEGEND_ITEMS = [
    { cls: 'tr-legend-none', label: 'Sin entrenar' },
    { cls: 'tr-legend-rest', label: 'Descansado' },
    { cls: 'tr-legend-mid', label: 'Medio' },
    { cls: 'tr-legend-high', label: 'Fatigado' },
  ];

  function muscleLegendHtml() {
    return '<div class="tr-body-legend" role="list" aria-label="Referencia de colores del mapa muscular">'
      + MUSCLE_LEGEND_ITEMS.map(function (item) {
          return '<span class="tr-body-legend-item" role="listitem">'
            + '<span class="tr-body-legend-dot ' + item.cls + '" aria-hidden="true"></span>' + escapeHtml(item.label)
            + '</span>';
        }).join('')
      + '</div>';
  }

  function buildMuscleMapShell() {
    return ''
      + '<div class="po-seg-control tr-body-toggle" role="group" aria-label="Vista del mapa muscular">'
      +   '<button type="button" class="po-seg-btn active" data-view="front" aria-pressed="true">Frente</button>'
      +   '<button type="button" class="po-seg-btn" data-view="back" aria-pressed="false">Espalda</button>'
      + '</div>'
      + '<div class="tr-body-map">'
      +   '<svg class="tr-body-svg active" data-view="front" viewBox="' + BODY_VIEWBOX + '">'
      +     bodyDecoHtml(BODY_FRONT_DECO) + bodyRegionsHtml(BODY_FRONT_REGIONS)
      +   '</svg>'
      +   '<svg class="tr-body-svg" data-view="back" viewBox="' + BODY_VIEWBOX + '" aria-hidden="true">'
      +     bodyDecoHtml(BODY_BACK_DECO) + bodyRegionsHtml(BODY_BACK_REGIONS)
      +   '</svg>'
      + '</div>'
      + muscleLegendHtml();
  }

  // Toggle is purely presentational — swaps which <g>/<svg> is visible,
  // never recomputes fatigue or re-fetches anything. Both views already
  // read the same result.muscles from the one renderMuscleMap() call that
  // built them.
  function switchBodyView(wrap, view) {
    wrap.querySelectorAll('.tr-body-toggle .po-seg-btn').forEach(function (b) {
      const isActive = b.dataset.view === view;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
    wrap.querySelectorAll('.tr-body-svg').forEach(function (svg) {
      const isActive = svg.dataset.view === view;
      svg.classList.toggle('active', isActive);
      if (isActive) svg.removeAttribute('aria-hidden'); else svg.setAttribute('aria-hidden', 'true');
      // Keyboard users can only Tab into the currently-visible view's regions.
      svg.querySelectorAll('.tr-body-region').forEach(function (r) { r.setAttribute('tabindex', isActive ? '0' : '-1'); });
    });
  }

  function wireMuscleMapInteractions(wrap) {
    const mapEl = wrap.querySelector('.tr-body-map');
    mapEl.addEventListener('click', function (e) {
      const region = e.target.closest('.tr-body-region');
      if (region) openMuscleDetailModal(region.dataset.muscle);
    });
    mapEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const region = e.target.closest('.tr-body-region');
      if (!region) return;
      e.preventDefault();
      openMuscleDetailModal(region.dataset.muscle);
    });
    wrap.querySelectorAll('.tr-body-toggle .po-seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchBodyView(wrap, btn.dataset.view); });
    });
  }

  // 3-step fatigue scale (0-33 recuperado / 34-66 moderado / 67-100 muy
  // fatigado) using the existing --success/--warning/--danger tokens — no
  // new colors introduced. lastTrainedAt === null means "never trained",
  // which is NOT the same thing as score 0 ("trained, but recovered") —
  // computeMuscleFatigue leaves both score and lastTrainedAt at their
  // initial 0/null together only when a muscle has no sessions at all, so
  // that's the one case that must render as neutral instead of green.
  function fatigueBodyFill(info) {
    if (!info || info.lastTrainedAt == null) return { color: 'var(--text-tertiary)', opacity: '0.22' };
    if (info.score <= 33) return { color: 'var(--success)', opacity: '0.62' };
    if (info.score <= 66) return { color: 'var(--warning)', opacity: '0.62' };
    return { color: 'var(--danger)', opacity: '0.62' };
  }

  // Updates fill + aria-label on the already-built regions in place
  // (rather than rebuilding the DOM) so the CSS transition on .tr-body-
  // region's fill/fill-opacity actually animates between successive
  // fatigue scores.
  function updateMuscleMapFills(wrap, result) {
    wrap.querySelectorAll('.tr-body-region').forEach(function (el) {
      const muscle = el.dataset.muscle;
      const info = result.muscles[muscle] || { score: 0, lastTrainedAt: null };
      const fill = fatigueBodyFill(info);
      el.style.fill = fill.color;
      el.style.fillOpacity = fill.opacity;
      el.setAttribute('aria-label', muscle + ' — fatiga ' + Math.round(info.score) + '%');
    });
  }

  // Last fatigue result computed by renderMuscleMap, kept around purely so
  // a later tap on the body (openMuscleDetailModal) can show "which muscle,
  // what state" without recomputing anything or touching the fatigue
  // pipeline itself.
  let lastMuscleFatigueResult = null;

  // Text for the fatigue state a tapped muscle is currently in — derived
  // from fatigueBodyFill's own color token (never a second copy of its
  // score thresholds), so this label can't fall out of sync with what the
  // body/legend are actually showing.
  const MUSCLE_STATUS_LABELS = {
    'var(--text-tertiary)': 'Sin entrenar',
    'var(--success)': 'Descansado',
    'var(--warning)': 'Medio',
    'var(--danger)': 'Fatigado',
  };
  function muscleStatusLabel(muscle) {
    const info = lastMuscleFatigueResult && lastMuscleFatigueResult.muscles[muscle];
    return MUSCLE_STATUS_LABELS[fatigueBodyFill(info).color] || null;
  }

  function renderMuscleMap() {
    const wrap = $('trMuscleMapWrap');
    if (!wrap) return;

    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    const config = (window.GymPesasStore && window.GymPesasStore.getMuscleFatigueConfig)
      ? window.GymPesasStore.getMuscleFatigueConfig()
      : window.DEFAULT_MUSCLE_FATIGUE_CONFIG;
    // Cross-device sleep/protein/screen-time, warmed by gym.html's
    // warmUpEcosystemInputs (see renderMuscleMapAfterWarmUp below) — falls
    // back to {} (→ this device's own localStorage inside GymEcosystem)
    // before that warm-up has run, e.g. Supabase not configured.
    const ecosystemOverrides = window.ecosystemOverrides || {};
    const result = window.computeMuscleFatigue
      ? window.computeMuscleFatigue(sessions, config, undefined, ecosystemOverrides)
      : { isPlaceholder: true, muscles: {} };
    lastMuscleFatigueResult = result;

    if (result.isPlaceholder) {
      // The config is now always seeded in Supabase — reaching this means
      // the fetch failed or hasn't landed yet, not a first-run state.
      wrap.innerHTML = '<div class="po-empty">No se pudo cargar el mapa muscular. Reintentá recargando la página.</div>';
      appendSyncNoteIfError(wrap);
      return;
    }

    // Build the front/back diagram once per wrap, then only update fills/
    // aria-labels in place on every later call (config edits, log saves,
    // ecosystem/sync changes) — see updateMuscleMapFills above.
    if (!wrap.querySelector('.tr-body-map')) {
      wrap.innerHTML = buildMuscleMapShell();
      wireMuscleMapInteractions(wrap);
      // Normalize initial tabindex/aria-hidden state through the same code
      // path as a real toggle click — bodyRegionsHtml gives every region
      // tabindex="0" at build time, so without this a keyboard user could
      // Tab into the still-hidden back view before ever touching the toggle.
      switchBodyView(wrap, 'front');
    } else {
      wrap.querySelectorAll('.tr-eco-note, .tr-sync-note').forEach(function (n) { n.remove(); });
    }
    updateMuscleMapFills(wrap, result);

    // Discreet ecosystem-modifier note — only when today's sleep/protein/
    // screen-time signals are actually slowing recovery down. Nothing
    // shown at all when neutral or when none of those 3 modules have data.
    const ecoNote = (window.GymEcosystem && window.GymEcosystem.describeEcosystemModifier)
      ? window.GymEcosystem.describeEcosystemModifier(dpDateKey(dpDateOffset(0)), config, ecosystemOverrides)
      : null;
    if (ecoNote) {
      wrap.insertAdjacentHTML('beforeend', '<div class="tr-eco-note">' + escapeHtml(ecoNote) + '</div>');
    }
    appendSyncNoteIfError(wrap);
  }
  window.renderMuscleMap = renderMuscleMap;

  // UI_AUDIT.md CRÍTICO #2 — GymPesasStore's sync (exercise overrides,
  // fatigue config, mobility log) used to fail silently with zero visible
  // signal. Same discreet-note pattern already used for the ecosystem
  // modifier note just above: only shown when there's actually something
  // wrong, nothing rendered when sync is fine.
  function appendSyncNoteIfError(wrap) {
    const sync = (window.GymPesasStore && window.GymPesasStore.getSyncStatus) ? window.GymPesasStore.getSyncStatus() : null;
    if (!sync || sync.status !== 'error') return;
    wrap.insertAdjacentHTML('beforeend', '<div class="tr-sync-note">⚠ ' + escapeHtml(sync.detail || 'No se pudo sincronizar con la nube.') + '</div>');
  }

  // First render after page load waits for the cross-device ecosystem
  // warm-up (brief "Cargando…" state) instead of rendering with whatever
  // happened to already be in window.ecosystemOverrides and then silently
  // re-rendering a moment later. Every other call site (config save, Pesas
  // log save, mobility log save, gpsOnChange) calls renderMuscleMap()
  // directly and reuses whatever's already there — gym.html's
  // warmUpEcosystemInputs throttles itself, this doesn't re-trigger it.
  function renderMuscleMapAfterWarmUp() {
    const wrap = $('trMuscleMapWrap');
    if (wrap) wrap.innerHTML = '<div class="po-empty">Cargando datos de recovery…</div>';
    const warmup = window.warmUpEcosystemInputs ? window.warmUpEcosystemInputs() : Promise.resolve();
    Promise.resolve(warmup).catch(function () {}).then(renderMuscleMap);
  }

  function openMuscleDetailModal(muscle) {
    const status = muscleStatusLabel(muscle);
    $('trMuscleDetailTitle').textContent = status ? muscle + ' — ' + status : muscle;
    const exercises = window.GymPesasStore.getExercisesByMuscle(muscle);
    const wrap = $('trMuscleDetailList');
    wrap.innerHTML = exercises.length
      ? exercises.map(function (ex) {
          const role = ex.primaryMuscle === muscle ? 'primario' : 'secundario';
          return '<div class="po-set-row"><span style="flex:1;font-size:13px;color:var(--text-1);">' + escapeHtml(ex.name)
            + ' <span style="color:var(--text-3);font-size:11px;">· ' + role + '</span></span></div>';
        }).join('')
      : '<div class="po-empty">Ningún ejercicio de tu historial trabaja este músculo todavía.</div>';
    $('trMuscleDetailModalBg').classList.add('show');
  }

  // ============================================================
  // EXERCISE LIBRARY — simplified: name + músculo primario/secundario +
  // flag de movilidad. No hay rutinas ni versiones. Entries are keyed by
  // exercise name (seed + user overrides, via GymPesasStore), not a
  // synthetic id — an exercise's name is its identity across the app.
  // ============================================================
  let editingExerciseName = null;

  function toggleMuscleFieldsForMobility(isMobility) {
    const fields = $('trExMuscleFields');
    if (fields) fields.classList.toggle('hidden', isMobility);
  }

  function renderExerciseLibraryList() {
    const wrap = $('trExerciseLibraryList');
    if (!wrap) return;
    const names = window.GymPesasStore.getAllKnownNames();
    if (!names.length) {
      wrap.innerHTML = '<div class="po-empty">Todavía no hay ejercicios registrados.</div>';
      return;
    }
    wrap.innerHTML = names.map(function (name) {
      const info = window.GymPesasStore.getExerciseInfo(name);
      let tag;
      if (info.isMobility) tag = '<span style="color:var(--text-3);font-size:11px;">· Movilidad</span>';
      else if (!info.isAssigned) tag = '<span style="color:var(--bad);font-size:11px;">· Sin músculo asignado</span>';
      else tag = '<span style="color:var(--text-3);font-size:11px;">· ' + escapeHtml(info.primaryMuscle) + '</span>';
      return '<div class="po-set-row" data-name="' + escapeHtml(name) + '">'
        + '<span style="flex:1;min-width:0;font-size:13px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
        +   escapeHtml(name) + ' ' + tag
        + '</span>'
        + '<button type="button" class="po-mini-btn tr-ex-edit-btn" title="Editar">✎</button>'
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.tr-ex-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openExerciseEditModal(btn.closest('.po-set-row').dataset.name); });
    });
  }

  function openExerciseLibraryModal() {
    renderExerciseLibraryList();
    $('trExerciseLibraryModalBg').classList.add('show');
  }
  function closeExerciseLibraryModal() { $('trExerciseLibraryModalBg').classList.remove('show'); }

  function openExerciseEditModal(existingName) {
    editingExerciseName = existingName || null;
    const info = editingExerciseName ? window.GymPesasStore.getExerciseInfo(editingExerciseName) : null;
    $('trExerciseEditTitle').textContent = editingExerciseName ? 'Editar ejercicio' : 'Nuevo ejercicio';
    const nameInput = $('trExName');
    nameInput.value = editingExerciseName || '';
    nameInput.disabled = !!editingExerciseName; // renaming would orphan workout_history entries
    $('trExerciseEditStatus').textContent = '';

    const groups = window.MUSCLE_GROUPS || [];
    const primarySel = $('trExPrimaryMuscle');
    primarySel.innerHTML = groups.map(function (m) {
      return '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>';
    }).join('');
    primarySel.value = (info && info.primaryMuscle) || groups[0] || '';

    const secWrap = $('trExSecondaryMuscles');
    const currentSecondary = (info && info.secondaryMuscles) || [];
    secWrap.innerHTML = groups.map(function (m) {
      const active = currentSecondary.indexOf(m) !== -1;
      return '<button type="button" class="tr-effort-btn tr-chip' + (active ? ' active' : '') + '" data-muscle="' + escapeHtml(m) + '" style="min-height:36px;padding:6px 10px;">' + escapeHtml(m) + '</button>';
    }).join('');
    secWrap.querySelectorAll('.tr-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { chip.classList.toggle('active'); });
    });

    const isMobilityBox = $('trExIsMobility');
    isMobilityBox.checked = !!(info && info.isMobility);
    toggleMuscleFieldsForMobility(isMobilityBox.checked);

    $('trExerciseEditModalBg').classList.add('show');
  }
  function closeExerciseEditModal() { $('trExerciseEditModalBg').classList.remove('show'); }

  function saveExerciseEdit() {
    const isMobility = $('trExIsMobility').checked;
    let name;
    if (editingExerciseName) {
      name = editingExerciseName;
    } else {
      name = $('trExName').value.trim();
      if (!name) { $('trExerciseEditStatus').textContent = 'Poné un nombre.'; return; }
    }
    const primaryMuscle = isMobility ? null : $('trExPrimaryMuscle').value;
    const secondaryMuscles = isMobility ? [] : Array.prototype.slice.call($('trExSecondaryMuscles').querySelectorAll('.tr-chip.active'))
      .map(function (chip) { return chip.dataset.muscle; })
      .filter(function (m) { return m !== primaryMuscle; });

    window.GymPesasStore.setExerciseOverride(name, { primaryMuscle: primaryMuscle, secondaryMuscles: secondaryMuscles, isMobility: isMobility });
    closeExerciseEditModal();
    renderExerciseLibraryList();
  }

  function initExerciseLibraryModals() {
    $('trOpenExerciseLibraryBtn').addEventListener('click', openExerciseLibraryModal);
    $('trExerciseLibraryClose').addEventListener('click', closeExerciseLibraryModal);
    $('trExerciseLibraryAddBtn').addEventListener('click', function () { openExerciseEditModal(null); });
    $('trExerciseEditCancel').addEventListener('click', closeExerciseEditModal);
    $('trExerciseEditSave').addEventListener('click', saveExerciseEdit);
    $('trExIsMobility').addEventListener('change', function (e) { toggleMuscleFieldsForMobility(e.target.checked); });
  }

  function refreshExerciseNameDatalist() {
    const dl = $('trExerciseNameOptions');
    if (!dl || !window.GymPesasStore) return;
    dl.innerHTML = window.GymPesasStore.getAllKnownNames().map(function (n) {
      return '<option value="' + escapeHtml(n) + '"></option>';
    }).join('');
  }

  // ============================================================
  // HOME STRIP + 4 DISCIPLINE CARDS
  // ============================================================
  function daysAgoLabel(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'hace 1 día';
    return 'hace ' + days + ' días';
  }

  function renderTrHomeStats() {
    const wrap = $('trHomeStats');
    if (!wrap) return;
    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    if (!sessions.length) {
      wrap.innerHTML = '<div class="po-empty">Registrá tu primer entrenamiento para ver tu racha y progreso.</div>';
      return;
    }
    const streak = window.GymDomain.computeTrainingStreak(sessions);
    const vol = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return (w.exercises || []).reduce(function (s, ex) { return s + (ex.sets || []).reduce(function (s2, set) { return s2 + (set.weight || 0) * (set.reps || 0); }, 0); }, 0); },
      function (w) { return (w.discipline || 'pesas') === 'pesas'; }
    );
    const config = (window.GymPesasStore && window.GymPesasStore.getMuscleFatigueConfig) ? window.GymPesasStore.getMuscleFatigueConfig() : window.DEFAULT_MUSCLE_FATIGUE_CONFIG;
    const fatigue = window.computeMuscleFatigue(sessions, config);
    const muscleTeaser = fatigue.isPlaceholder
      ? 'Sin config'
      : (Object.keys(fatigue.muscles).filter(function (m) { return fatigue.muscles[m].score > 30; }).length + ' activos');
    const deltaLabel = vol.deltaPct == null ? '' : (' · ' + (vol.deltaPct >= 0 ? '+' : '') + Math.round(vol.deltaPct) + '%');

    wrap.innerHTML =
      '<div class="tr-home-stat"><div class="tr-home-stat-val">' + streak + '</div><div class="tr-home-stat-label">Racha (días)</div></div>'
      + '<div class="tr-home-stat"><div class="tr-home-stat-val">' + Math.round(vol.thisWeek) + 'kg</div><div class="tr-home-stat-label">Volumen sem' + escapeHtml(deltaLabel) + '</div></div>'
      + '<div class="tr-home-stat"><div class="tr-home-stat-val">' + escapeHtml(muscleTeaser) + '</div><div class="tr-home-stat-label">Mapa muscular</div></div>';
  }

  const DISCIPLINE_CARDS = [
    { discipline: 'pesas', id: 'trCardPesas', title: 'Pesas' },
    { discipline: 'boxeo_muaythai', id: 'trCardBoxeo', title: 'Boxeo / Muay Thai' },
    { discipline: 'bici', id: 'trCardBici', title: 'Bicicleta' },
    { discipline: 'running', id: 'trCardRunning', title: 'Running' },
  ];

  function cardContextFor(discipline, sessions) {
    const last = sessions.find(function (w) { return (w.discipline || 'pesas') === discipline; });
    if (!last) return 'Sin sesiones todavía';
    if (discipline !== 'pesas' && last.cardio && last.cardio.distance != null) {
      return 'último: ' + last.cardio.distance + ' km';
    }
    return daysAgoLabel(last.date) || 'sin datos';
  }

  // Live "this week" stat per card — same window.GymDomain.computeWeekOverWeek
  // that already backs the 3 comparison charts above, just with a
  // discipline-specific filter/extractor per card instead of a new
  // aggregation function. Bici/Running are deliberately split (each scoped
  // to its own discipline) so their sum matches the combined "Running /
  // Bici (distancia)" chart exactly, and Boxeo is scoped to
  // boxeo_muaythai only (not lumped with the other cardio disciplines).
  function weekStatFor(discipline, sessions) {
    if (discipline === 'pesas') {
      const r = window.GymDomain.computeWeekOverWeek(
        sessions,
        function (w) { return (w.exercises || []).reduce(function (s, ex) { return s + (ex.sets || []).length; }, 0); },
        function (w) { return (w.discipline || 'pesas') === 'pesas'; }
      );
      return r.thisWeek > 0 ? (r.thisWeek + ' series esta semana') : '—';
    }
    if (discipline === 'boxeo_muaythai') {
      const r = window.GymDomain.computeWeekOverWeek(
        sessions,
        function (w) { return w.cardio ? (w.cardio.duration || 0) : 0; },
        function (w) { return w.discipline === 'boxeo_muaythai'; }
      );
      return r.thisWeek > 0 ? (r.thisWeek + ' min esta semana') : '—';
    }
    // bici / running
    const r = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return (w.cardio && w.cardio.distance != null) ? w.cardio.distance : 0; },
      function (w) { return w.discipline === discipline; }
    );
    return r.thisWeek > 0 ? (r.thisWeek + ' km esta semana') : '—';
  }

  function renderTrCards() {
    const wrap = $('trCards');
    if (!wrap) return;
    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    wrap.innerHTML = DISCIPLINE_CARDS.map(function (c) {
      return '<button type="button" class="tr-card" id="' + c.id + '">'
        + '<span class="tr-card-title">' + escapeHtml(c.title) + '</span>'
        + '<span class="tr-card-foot">'
        +   '<span class="tr-card-context">' + escapeHtml(cardContextFor(c.discipline, sessions)) + '</span>'
        +   '<span class="tr-card-week">' + escapeHtml(weekStatFor(c.discipline, sessions)) + '</span>'
        + '</span>'
        + '</button>';
    }).join('');
    $('trCardPesas').addEventListener('click', openPesasLogModal);
    $('trCardBoxeo').addEventListener('click', function () { openCardioModal('boxeo_muaythai'); });
    $('trCardBici').addEventListener('click', function () { openCardioModal('bici'); });
    $('trCardRunning').addEventListener('click', function () { openCardioModal('running'); });
  }

  // ============================================================
  // PESAS — manual log (replaces the old routine/session/RIR/rest-timer
  // flow entirely). Just: date + exercises + sets (reps × peso). Every
  // exercise is routed to workout_history (fuerza/sin asignar) or the
  // mobility log purely by its classification in GymPesasStore — same
  // partitionWorkoutExercises() the Lyfta import uses.
  // ============================================================
  let pesasLogRows = [];   // [{rowId, name, sets:[{reps,weight,rir}]}]
  let pesasLogRowSeq = 0;
  let pesasLogDatePicker = null; // lazily created, reset to "Hoy" every time
  let pesasLogIntensity = null;  // 1..5, required — null renders with no pill active

  // RIR (reps in reserve) or Fallo (failure) — optional per-set effort tag.
  // Purely informational: stored as `sets[].rir` (already part of the
  // workout_history schema, see whNormalizeWorkout) and never affects
  // PRs/volume/streak.
  const RIR_SELECT_OPTIONS = [
    { value: '', label: 'RIR / Fallo' },
    { value: 'RIR5', label: 'RIR 5' },
    { value: 'RIR4', label: 'RIR 4' },
    { value: 'RIR3', label: 'RIR 3' },
    { value: 'RIR2', label: 'RIR 2' },
    { value: 'RIR1', label: 'RIR 1' },
    { value: 'fallo', label: 'Fallo' },
  ];
  function rirSelectHtml(selected) {
    return '<select class="tr-pesas-set-rir" aria-label="RIR o fallo">'
      + RIR_SELECT_OPTIONS.map(function (o) {
          return '<option value="' + o.value + '"' + (o.value === (selected || '') ? ' selected' : '') + '>' + o.label + '</option>';
        }).join('')
      + '</select>';
  }

  // Same "last session for this discipline" criterion used elsewhere
  // (cardContextFor above) — sessions come back most-recent-date-first
  // from window.WH.getAllWorkouts(), so .find() is enough.
  function findLastPesasWorkout() {
    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    return sessions.find(function (w) { return (w.discipline || 'pesas') === 'pesas'; }) || null;
  }

  function openPesasLogModal() {
    pesasLogRows = [{ rowId: ++pesasLogRowSeq, name: '', sets: [{ reps: 8, weight: 20, rir: '' }] }];
    renderPesasLogRows();
    $('trPesasLogStatus').textContent = '';
    if (!pesasLogDatePicker) pesasLogDatePicker = createDatePicker($('trPesasLogDatePicker'));
    pesasLogDatePicker.reset();
    refreshExerciseNameDatalist();
    const repeatBtn = $('trPesasLogRepeatBtn');
    if (repeatBtn) repeatBtn.disabled = !findLastPesasWorkout();

    // Session metrics (CAMBIO 2) — intensity starts unselected (no active
    // pill) so the required field visibly needs a tap; the rest are blank,
    // never pre-filled, so an untouched optional field saves as null.
    pesasLogIntensity = null;
    window.renderButtonGroup($('trPesasIntensityGroup'), window.DIFFICULTY_OPTIONS, pesasLogIntensity, function (v) { pesasLogIntensity = v; });
    $('trPesasDuration').value = '';
    $('trPesasTimeOfDay').value = '';
    $('trPesasAvgHr').value = '';
    $('trPesasMaxHr').value = '';

    $('trPesasLogModalBg').classList.add('show');
  }
  function closePesasLogModal() { $('trPesasLogModalBg').classList.remove('show'); }

  // Pre-fills the form with the exercises/sets from the most recent Pesas
  // workout — the date picker is left untouched (stays on "Hoy"), only
  // exercises/sets are copied, and everything stays editable before saving.
  function pesasLogRepeatLastSession() {
    const last = findLastPesasWorkout();
    if (!last || !last.exercises || !last.exercises.length) return;
    pesasLogRows = last.exercises.map(function (ex) {
      return {
        rowId: ++pesasLogRowSeq,
        name: ex.name || '',
        sets: (ex.sets || []).map(function (s) { return { reps: s.reps || 0, weight: s.weight || 0, rir: s.rir || '' }; }),
      };
    });
    renderPesasLogRows();
  }

  // Column header for the sets grid — inputs come pre-filled with default
  // values (8 reps / 20kg), so the placeholder text never actually shows;
  // without this, "which column is reps vs. kg" is only guessable.
  const PESAS_SET_HEADER_HTML =
    '<div class="tr-pesas-set-labels">'
    + '<span></span><span>Reps</span><span>Kg</span><span>RIR</span><span></span>'
    + '</div>';

  function pesasLogRowHtml(row) {
    const setsHtml = row.sets.map(function (s, i) {
      return '<div class="tr-pesas-set-row" data-set-i="' + i + '">'
        + '<span class="tr-set-row-num">' + (i + 1) + '</span>'
        + '<input type="number" class="tr-pesas-set-reps" value="' + s.reps + '" min="0" aria-label="Reps">'
        + '<input type="number" class="tr-pesas-set-weight" value="' + s.weight + '" min="0" step="0.5" aria-label="Peso (kg)">'
        + rirSelectHtml(s.rir)
        + '<button type="button" class="po-mini-btn tr-pesas-set-remove" title="Quitar serie">×</button>'
        + '</div>';
    }).join('');
    return '<div class="tr-session-ex-block" data-row-id="' + row.rowId + '">'
      + '<div class="tr-session-ex-head">'
      +   '<input type="text" class="tr-pesas-ex-name" list="trExerciseNameOptions" placeholder="Nombre del ejercicio" value="' + escapeHtml(row.name) + '">'
      +   '<button type="button" class="po-mini-btn tr-pesas-ex-remove" title="Quitar ejercicio">×</button>'
      + '</div>'
      + '<div class="tr-pesas-sets">' + PESAS_SET_HEADER_HTML + setsHtml + '</div>'
      + '<button type="button" class="po-add-row-btn tr-pesas-add-set">+ Agregar serie</button>'
      + '</div>';
  }

  function renderPesasLogRows() {
    const wrap = $('trPesasLogExList');
    if (!pesasLogRows.length) { wrap.innerHTML = '<div class="po-empty">Agregá al menos un ejercicio.</div>'; return; }
    wrap.innerHTML = pesasLogRows.map(pesasLogRowHtml).join('');
    wrap.querySelectorAll('.tr-session-ex-block').forEach(function (blockEl) {
      const rowId = Number(blockEl.dataset.rowId);
      const row = pesasLogRows.find(function (r) { return r.rowId === rowId; });
      blockEl.querySelector('.tr-pesas-ex-name').addEventListener('input', function (e) { row.name = e.target.value; });
      blockEl.querySelector('.tr-pesas-ex-remove').addEventListener('click', function () {
        pesasLogRows = pesasLogRows.filter(function (r) { return r.rowId !== rowId; });
        renderPesasLogRows();
      });
      blockEl.querySelector('.tr-pesas-add-set').addEventListener('click', function () {
        const last = row.sets.length ? row.sets[row.sets.length - 1] : null;
        row.sets.push({ reps: 8, weight: last ? last.weight : 20, rir: last ? last.rir : '' });
        renderPesasLogRows();
      });
      blockEl.querySelectorAll('.tr-pesas-set-row').forEach(function (setEl) {
        const i = Number(setEl.dataset.setI);
        setEl.querySelector('.tr-pesas-set-reps').addEventListener('input', function (e) { row.sets[i].reps = Number(e.target.value) || 0; });
        setEl.querySelector('.tr-pesas-set-weight').addEventListener('input', function (e) { row.sets[i].weight = Number(e.target.value) || 0; });
        setEl.querySelector('.tr-pesas-set-rir').addEventListener('change', function (e) { row.sets[i].rir = e.target.value; });
        setEl.querySelector('.tr-pesas-set-remove').addEventListener('click', function () {
          row.sets.splice(i, 1);
          renderPesasLogRows();
        });
      });
    });
  }

  function pesasLogAddExercise() {
    pesasLogRows.push({ rowId: ++pesasLogRowSeq, name: '', sets: [{ reps: 8, weight: 20, rir: '' }] });
    renderPesasLogRows();
  }

  function savePesasLog() {
    if (pesasLogIntensity == null) { $('trPesasLogStatus').textContent = 'Elegí la intensidad de la sesión.'; return; }
    const date = pesasLogDatePicker ? pesasLogDatePicker.getSelectedDateKey() : new Date().toISOString().slice(0, 10);
    const rawExercises = pesasLogRows
      .map(function (r) { return { name: r.name.trim(), sets: r.sets.filter(function (s) { return s.reps > 0; }) }; })
      .filter(function (r) { return r.name && r.sets.length; });
    if (!rawExercises.length) { $('trPesasLogStatus').textContent = 'Agregá al menos un ejercicio con una serie válida.'; return; }

    // Empty optional input -> null, never a spurious 0.
    const num = function (id) { const v = $(id).value; return v === '' ? null : Number(v); };
    const sessionMetrics = {
      avgHr: num('trPesasAvgHr'),
      maxHr: num('trPesasMaxHr'),
      durationMin: num('trPesasDuration'),
      timeOfDay: $('trPesasTimeOfDay').value || null,
      intensity: pesasLogIntensity,
    };

    const allWorkoutsBefore = window.WH.getAllWorkouts();
    const partitioned = window.GymPesasStore.partitionWorkoutExercises(date, rawExercises);

    if (partitioned.mobilityEntries.length) window.GymPesasStore.addMobilityLogEntries(partitioned.mobilityEntries);

    if (partitioned.keptExercises.length) {
      const workout = window.WH.normalizeWorkout({
        date: date, title: 'Pesas', source: 'manual', discipline: 'pesas', exercises: partitioned.keptExercises, sessionMetrics: sessionMetrics,
      }, 'manual');
      window.WH.appendWorkout(workout);
      window.WH.commit(workout);

      partitioned.keptExercises.forEach(function (ex) {
        const vol = ex.sets.reduce(function (s, x) { return s + (x.weight || 0) * (x.reps || 0); }, 0);
        const volResult = window.GymDomain.checkVolumePR(ex.name, vol, allWorkoutsBefore);
        if (volResult.isPR && vol > 0) window.showToast('¡Nuevo PR de volumen! ' + escapeHtml(ex.name), { celebrate: true });
        const maxWeight = Math.max.apply(null, ex.sets.map(function (s) { return s.weight || 0; }));
        const weightResult = window.GymDomain.checkWeightPR(ex.name, maxWeight, allWorkoutsBefore);
        if (weightResult.isPR && maxWeight > 0) window.showToast('¡Nuevo PR de peso! ' + escapeHtml(ex.name) + ' — ' + maxWeight + 'kg', { celebrate: true });
      });
    }

    closePesasLogModal();
    renderTrCards();
    renderTrHomeStats();
    renderMuscleMap();
    renderPeriodCharts();
    renderBoxeoInsights();
    renderExerciseProgression();
    renderMobilityHistory();
  }

  function initPesasLogModal() {
    $('trPesasLogAddExBtn').addEventListener('click', pesasLogAddExercise);
    $('trPesasLogRepeatBtn').addEventListener('click', pesasLogRepeatLastSession);
    $('trPesasLogCancel').addEventListener('click', closePesasLogModal);
    $('trPesasLogSave').addEventListener('click', savePesasLog);
  }

  // ============================================================
  // MOVILIDAD — sub-sección dentro de Pesas (no una 5ta disciplina). Log
  // rápido (fecha + nombre + reps opcional) + historial. Un ejercicio
  // logueado acá siempre se marca isMobility:true en el store, para que
  // cualquier futura carga con ese mismo nombre (import o manual) se siga
  // clasificando como movilidad.
  // ============================================================
  let mobilityDatePicker = null;

  function openMobilityLogModal() {
    $('trMobilityName').value = '';
    $('trMobilityReps').value = '';
    $('trMobilityStatus').textContent = '';
    if (!mobilityDatePicker) mobilityDatePicker = createDatePicker($('trMobilityDatePicker'));
    mobilityDatePicker.reset();
    refreshExerciseNameDatalist();
    $('trMobilityLogModalBg').classList.add('show');
  }
  function closeMobilityLogModal() { $('trMobilityLogModalBg').classList.remove('show'); }

  function saveMobilityLog() {
    const name = $('trMobilityName').value.trim();
    if (!name) { $('trMobilityStatus').textContent = 'Poné un nombre.'; return; }
    if (window.GymPesasStore.isDiscarded(name)) { $('trMobilityStatus').textContent = 'Ese nombre está excluido del sistema.'; return; }
    const date = mobilityDatePicker ? mobilityDatePicker.getSelectedDateKey() : new Date().toISOString().slice(0, 10);
    const repsVal = $('trMobilityReps').value;
    const reps = repsVal === '' ? null : Number(repsVal);

    window.GymPesasStore.ensureExercise(name);
    window.GymPesasStore.setExerciseOverride(name, { isMobility: true });
    window.GymPesasStore.addMobilityLogEntry({ date: date, name: name, reps: reps });

    closeMobilityLogModal();
    renderMobilityHistory();
  }

  function renderMobilityHistory() {
    const wrap = $('trMobilityHistoryList');
    if (!wrap) return;
    const log = window.GymPesasStore ? window.GymPesasStore.getMobilityLog() : [];
    if (!log.length) { wrap.innerHTML = '<div class="po-empty">Sin sesiones de movilidad todavía.</div>'; return; }
    wrap.innerHTML = log.slice(0, 20).map(function (e) {
      return '<div class="wh-session">'
        + '<div class="wh-session-head"><span class="wh-session-date">' + escapeHtml(e.date || '') + '</span></div>'
        + '<div class="wh-session-title">' + escapeHtml(e.name) + (e.reps != null ? ' · ' + e.reps + ' reps' : '') + '</div>'
        + '</div>';
    }).join('');
  }

  function initMobilityLogModal() {
    $('trMobilityOpenBtn').addEventListener('click', openMobilityLogModal);
    $('trMobilityCancel').addEventListener('click', closeMobilityLogModal);
    $('trMobilitySave').addEventListener('click', saveMobilityLog);
  }

  // ============================================================
  // BOXEO/MUAY THAI + RUNNING/BICI — one shared form, fields toggled by
  // discipline. Duration is the only required field for every mode.
  // Untouched by the Pesas rework.
  // ============================================================
  let cardioDiscipline = null; // 'boxeo_muaythai' | 'bici' | 'running'
  let cardioSubtype = 'boxeo'; // only meaningful for boxeo_muaythai
  let cardioDifficulty = 3;
  let cardioDatePicker = null; // lazily created on first openCardioModal(), reset to "Hoy" every time

  const CARDIO_TITLES = { boxeo_muaythai: 'Boxeo / Muay Thai', bici: 'Bicicleta', running: 'Running' };

  function openCardioModal(discipline) {
    cardioDiscipline = discipline;
    $('trCardioModalTitle').textContent = CARDIO_TITLES[discipline] || discipline;
    $('trCardioDuration').value = '';
    $('trCardioDistance').value = '';
    $('trCardioAvgHr').value = '';
    $('trCardioMaxHr').value = '';
    $('trCardioPace').value = '';
    $('trCardioSpo2').value = '';
    $('trCardioNotes').value = '';
    $('trCardioStatus').textContent = '';

    const isBoxeo = discipline === 'boxeo_muaythai';
    $('trCardioSubtypeField').classList.toggle('hidden', !isBoxeo);
    $('trCardioDifficultyField').classList.toggle('hidden', !isBoxeo);
    $('trCardioRunBiciFields').classList.toggle('hidden', isBoxeo);

    if (isBoxeo) {
      cardioSubtype = 'boxeo';
      $('trCardioSubtypeSeg').querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.v === cardioSubtype);
      });
      cardioDifficulty = 3;
      window.renderButtonGroup($('trCardioDifficultyGroup'), window.DIFFICULTY_OPTIONS, cardioDifficulty, function (v) { cardioDifficulty = v; });
    } else {
      cardioSubtype = discipline; // 'bici' or 'running'
    }
    if (!cardioDatePicker) cardioDatePicker = createDatePicker($('trCardioDatePicker'));
    cardioDatePicker.reset(); // always opens on "Hoy"
    $('trCardioModalBg').classList.add('show');
  }
  function closeCardioModal() { $('trCardioModalBg').classList.remove('show'); }

  function saveCardio() {
    const duration = parseFloat($('trCardioDuration').value);
    if (!duration || duration <= 0) { $('trCardioStatus').textContent = 'Ingresá la duración.'; return; }
    const num = function (id) { const v = $(id).value; return v === '' ? null : Number(v); };
    const cardio = {
      subtype: cardioSubtype,
      duration: duration,
      distance: cardioDiscipline === 'boxeo_muaythai' ? null : num('trCardioDistance'),
      avgHr: cardioDiscipline === 'boxeo_muaythai' ? null : num('trCardioAvgHr'),
      maxHr: cardioDiscipline === 'boxeo_muaythai' ? null : num('trCardioMaxHr'),
      pace: cardioDiscipline === 'boxeo_muaythai' ? null : num('trCardioPace'),
      spo2: cardioDiscipline === 'boxeo_muaythai' ? null : num('trCardioSpo2'),
      difficulty: cardioDiscipline === 'boxeo_muaythai' ? cardioDifficulty : null,
    };
    const workout = window.WH.normalizeWorkout({
      date: cardioDatePicker ? cardioDatePicker.getSelectedDateKey() : new Date().toISOString().slice(0, 10),
      title: CARDIO_TITLES[cardioDiscipline] || cardioDiscipline,
      source: 'manual',
      discipline: cardioDiscipline,
      notes: $('trCardioNotes').value.trim(),
      exercises: [],
      cardio: cardio,
    }, 'manual');
    window.WH.appendWorkout(workout);
    window.WH.commit(workout);
    closeCardioModal();
    renderTrCards();
    renderTrHomeStats();
    renderMuscleMap();
    renderPeriodCharts();
    renderBoxeoInsights();
  }

  function initCardioModal() {
    $('trCardioSubtypeSeg').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        cardioSubtype = b.dataset.v;
        $('trCardioSubtypeSeg').querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
    });
    $('trCardioCancel').addEventListener('click', closeCardioModal);
    $('trCardioSave').addEventListener('click', saveCardio);
  }

  // Measured HR (sessionMetrics.avgHr/maxHr) for a pesas session, or — when
  // nothing was measured but intensity was logged — an estimateHrRange
  // fallback tagged "(estimado)". Purely cosmetic display string: this
  // never feeds computeMuscleFatigue or computeSessionLoad, same rule as
  // boxeo's HR estimate.
  function pesasHrLineFor(session) {
    const m = session && session.sessionMetrics;
    if (!m) return '';
    if (m.avgHr != null || m.maxHr != null) {
      const parts = [];
      if (m.avgHr != null) parts.push(m.avgHr);
      if (m.maxHr != null) parts.push('máx ' + m.maxHr);
      return 'HR: ' + parts.join(' / ') + ' bpm';
    }
    if (m.intensity != null && window.GymEcosystem && window.GymEcosystem.estimateHrRange) {
      const hr = window.GymEcosystem.estimateHrRange(m.intensity);
      if (hr) return 'HR: ' + hr.low + '–' + hr.high + ' bpm (estimado)';
    }
    return '';
  }

  // ============================================================
  // ANALYTICS — period-comparison charts (one component, 3 instances) +
  // per-exercise PR progression. Untouched by the Pesas rework.
  // ============================================================
  function renderPeriodCharts() {
    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];

    function showOrEmpty(svgId, emptyId, hasAny) {
      if (hasAny) { $(svgId).classList.remove('hidden'); $(emptyId).classList.add('hidden'); }
      else { $(svgId).classList.add('hidden'); $(emptyId).classList.remove('hidden'); }
    }

    const vol = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return (w.exercises || []).reduce(function (s, ex) { return s + (ex.sets || []).reduce(function (s2, set) { return s2 + (set.weight || 0) * (set.reps || 0); }, 0); }, 0); },
      function (w) { return (w.discipline || 'pesas') === 'pesas'; }
    );
    showOrEmpty('trWeeklyVolSvg', 'trWeeklyVolEmpty', vol.thisWeek > 0 || vol.lastWeek > 0);
    if (vol.thisWeek > 0 || vol.lastWeek > 0) {
      // deltaPct only when there's a real last-week baseline to compare
      // against — computeWeekOverWeek reports a synthetic 100% off a zero
      // baseline, which would read as a misleading "doubled" claim here.
      window.renderPeriodComparisonChart('trWeeklyVolSvg', { thisPeriod: vol.thisWeek, lastPeriod: vol.lastWeek, unit: 'kg', deltaPct: vol.lastWeek > 0 ? vol.deltaPct : null });
    }
    const hrLineEl = $('trPesasLastHr');
    if (hrLineEl) {
      const lastPesas = sessions.find(function (w) { return (w.discipline || 'pesas') === 'pesas'; });
      hrLineEl.textContent = pesasHrLineFor(lastPesas);
    }

    const cardioMin = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return w.cardio ? (w.cardio.duration || 0) : 0; },
      function (w) { return !!w.cardio; }
    );
    showOrEmpty('trCardioMinSvg', 'trCardioMinEmpty', cardioMin.thisWeek > 0 || cardioMin.lastWeek > 0);
    if (cardioMin.thisWeek > 0 || cardioMin.lastWeek > 0) {
      window.renderPeriodComparisonChart('trCardioMinSvg', { thisPeriod: cardioMin.thisWeek, lastPeriod: cardioMin.lastWeek, unit: 'min', deltaPct: cardioMin.lastWeek > 0 ? cardioMin.deltaPct : null });
    }

    const dist = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return (w.cardio && w.cardio.distance != null) ? w.cardio.distance : 0; },
      function (w) { return w.discipline === 'running' || w.discipline === 'bici'; }
    );
    showOrEmpty('trDistanceSvg', 'trDistanceEmpty', dist.thisWeek > 0 || dist.lastWeek > 0);
    if (dist.thisWeek > 0 || dist.lastWeek > 0) {
      window.renderPeriodComparisonChart('trDistanceSvg', { thisPeriod: dist.thisWeek, lastPeriod: dist.lastWeek, unit: 'km', deltaPct: dist.lastWeek > 0 ? dist.deltaPct : null });
    }

    const muscleVol = window.GymDomain.computeWeeklySetsByMuscle ? window.GymDomain.computeWeeklySetsByMuscle(sessions) : {};
    const hasMuscleVol = Object.keys(muscleVol).some(function (m) { return muscleVol[m] > 0; });
    showOrEmpty('trMuscleVolSvg', 'trMuscleVolEmpty', hasMuscleVol);
    if (hasMuscleVol) {
      window.renderMuscleVolumeChart('trMuscleVolSvg', muscleVol);
    }
  }

  // ============================================================
  // BOXEO/MUAY THAI — session load ring + cosmetic HR estimate (most recent
  // session) + weekly load trend. Same muscleFatigueConfig lookup as
  // renderTrHomeStats() above so the intensity curve driving the ring
  // matches the one driving the muscle map. HR is display-only: it reads
  // window.GymEcosystem.estimateHrRange but that value is never passed into
  // computeMuscleFatigue or computeSessionLoad.
  // ============================================================
  function renderBoxeoInsights() {
    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    const config = (window.GymPesasStore && window.GymPesasStore.getMuscleFatigueConfig) ? window.GymPesasStore.getMuscleFatigueConfig() : window.DEFAULT_MUSCLE_FATIGUE_CONFIG;

    // getAllWorkouts() is already sorted most-recent-first (whSortedWorkouts).
    const last = sessions.find(function (w) { return w.discipline === 'boxeo_muaythai'; });
    const hasLast = !!(last && last.cardio);
    if ($('trBoxeoLastEmpty')) $('trBoxeoLastEmpty').classList.toggle('hidden', hasLast);
    if ($('trBoxeoLastWrap')) $('trBoxeoLastWrap').classList.toggle('hidden', !hasLast);
    if (hasLast) {
      const load = window.GymDomain.computeSessionLoad(last, config);
      window.renderLoadRing('trBoxeoLoadRingSvg', load);
      const hr = window.GymEcosystem.estimateHrRange(last.cardio.difficulty);
      $('trBoxeoHrEstimate').textContent = hr ? ('HR estimado: ' + hr.low + '–' + hr.high + ' bpm') : '';
    }

    const weeklyLoad = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return window.GymDomain.computeSessionLoad(w, config).score; },
      function (w) { return w.discipline === 'boxeo_muaythai'; }
    );
    const hasWeeklyLoad = weeklyLoad.thisWeek > 0 || weeklyLoad.lastWeek > 0;
    if ($('trBoxeoLoadTrendSvg')) $('trBoxeoLoadTrendSvg').classList.toggle('hidden', !hasWeeklyLoad);
    if ($('trBoxeoLoadTrendEmpty')) $('trBoxeoLoadTrendEmpty').classList.toggle('hidden', hasWeeklyLoad);
    if (hasWeeklyLoad) {
      window.renderPeriodComparisonChart('trBoxeoLoadTrendSvg', { thisPeriod: weeklyLoad.thisWeek, lastPeriod: weeklyLoad.lastWeek, unit: 'carga', deltaPct: weeklyLoad.lastWeek > 0 ? weeklyLoad.deltaPct : null });
    }
  }

  const PROGRESSION_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // whGetPesasSetsGroupedByExercise (window.WH) returns one entry per SET
  // (every set of every session), not per session — charting each of those
  // individually is what produced the old "ECG spike" zigzag. One point per
  // session (its top set that day) is the actual progression signal; this
  // is a display-only reduction, WH's own data/shape is untouched.
  function aggregateSessionsForChart(sets) {
    const byDate = {};
    (sets || []).forEach(function (s) {
      if (byDate[s.date] == null || s.weight > byDate[s.date]) byDate[s.date] = s.weight;
    });
    return Object.keys(byDate).sort().map(function (d) { return { date: d, weight: byDate[d] }; });
  }
  function fmtProgressionDate(dstr) {
    const parts = (dstr || '').split('-').map(Number);
    const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    return PROGRESSION_MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
  }

  function hideProgressionTooltip() {
    const t = $('trProgressionTooltip');
    if (t) t.style.display = 'none';
  }
  function showProgressionTooltip(el) {
    const tip = $('trProgressionTooltip'), wrap = $('trProgressionChartWrap');
    if (!tip || !wrap) return;
    tip.textContent = el.getAttribute('data-weight') + 'kg · ' + el.getAttribute('data-date');
    tip.style.display = 'block';
    const wrapRect = wrap.getBoundingClientRect(), elRect = el.getBoundingClientRect();
    tip.style.left = (elRect.left + elRect.width / 2 - wrapRect.left) + 'px';
    tip.style.top = (elRect.top - wrapRect.top) + 'px';
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.cht-dot, .cht-dot-hit')) hideProgressionTooltip();
  });

  // Redesigned progression chart: matched-width viewBox (no distortion),
  // 0-based Y axis with the same nice-step rounding used elsewhere in this
  // module (real variation reads as real variation, not exaggerated by a
  // min/max-of-the-series axis), gridlines, a dot per session with a hover
  // tooltip, discrete labels on the first/last/max points, and a subtle
  // area fill under the line.
  function drawProgressionSvg(rawSets) {
    const svg = $('trProgressionSvg');
    const emptyEl = $('trProgressionEmpty');
    if (!svg || !emptyEl) return;

    const points = aggregateSessionsForChart(rawSets);
    if (points.length < 2) {
      svg.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      hideProgressionTooltip();
      return;
    }
    emptyEl.classList.add('hidden');
    svg.classList.remove('hidden');

    const n = points.length;
    const W = svg.getBoundingClientRect().width || 700, H = 220;
    const padLeft = 40, padRight = 14, padTop = 32, padBottom = 30;
    const plotW = W - padLeft - padRight, plotH = H - padTop - padBottom;
    const baseY = padTop + plotH;

    const weights = points.map(function (p) { return p.weight; });
    const rawMax = Math.max.apply(null, weights.concat([1]));
    const step = rawMax <= 4 ? 1 : Math.ceil(rawMax / 4);
    const niceMax = Math.ceil(rawMax / step) * step;

    const xAt = function (i) { return padLeft + (n === 1 ? 0 : plotW * (i / (n - 1))); };
    const yAt = function (v) { return baseY - plotH * (Math.min(v, niceMax) / niceMax); };

    let html = '<defs><linearGradient id="trProgressionAreaGradient" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="var(--good)" stop-opacity="0.28"></stop>'
      + '<stop offset="100%" stop-color="var(--good)" stop-opacity="0"></stop>'
      + '</linearGradient></defs>';

    // Grid + Y-axis weight labels, 0-based floor (never the series' own min)
    // so a small real fluctuation reads as small, not as a dramatic swing.
    for (let v = 0; v <= niceMax; v += step) {
      const y = yAt(v);
      html += '<line class="wh-freq-grid" x1="' + padLeft + '" y1="' + y.toFixed(1) + '" x2="' + (W - padRight).toFixed(1) + '" y2="' + y.toFixed(1) + '"></line>'
        + '<text class="wh-freq-yaxis-label" x="' + (padLeft - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    }

    let linePath = '';
    points.forEach(function (p, i) {
      linePath += (i === 0 ? 'M' : ' L') + xAt(i).toFixed(1) + ' ' + yAt(p.weight).toFixed(1);
    });
    const areaPath = linePath + ' L' + xAt(n - 1).toFixed(1) + ' ' + baseY.toFixed(1) + ' L' + xAt(0).toFixed(1) + ' ' + baseY.toFixed(1) + ' Z';
    html += '<path class="cht-area" d="' + areaPath + '"></path>';
    html += '<path class="cht-line" d="' + linePath + '"></path>';

    // Thin out X-axis date labels when they'd overlap, same technique as
    // whRenderFrequency's weekly-bar labels — always keep the first/last.
    const CHAR_W = 6.6; // calibrated in gymCharts.js's truncateLabel comment
    const dateLabels = points.map(function (p) { return fmtProgressionDate(p.date); });
    const maxLabelW = Math.max.apply(null, dateLabels.map(function (l) { return l.length * CHAR_W; }).concat([0]));
    const slotW = n > 1 ? plotW / (n - 1) : plotW;
    const showEvery = maxLabelW > slotW ? Math.ceil(maxLabelW / slotW) : 1;
    // Explicit shown-index set (see whRenderFrequency's identical comment in
    // gym.html) — a naive "i % showEvery === 0 || i === n-1" can force the
    // last label immediately next to a modulo-selected one one slot before
    // it, recreating the very overlap this thinning is meant to prevent.
    const shownIdx = {};
    for (let i = 0; i < n; i += showEvery) shownIdx[i] = true;
    shownIdx[n - 1] = true;
    if (showEvery > 1) {
      for (let i = 0; i < n - 1; i++) { if ((n - 1 - i) < showEvery) delete shownIdx[i]; }
    }

    let maxIdx = 0;
    points.forEach(function (p, i) { if (p.weight > points[maxIdx].weight) maxIdx = i; });
    // Only add the max-point callout when it's far enough (in on-screen px,
    // not index count) from the first/last labels to not collide with them —
    // a max that lands on the session right before/after an endpoint would
    // otherwise print two overlapping "NNkg" labels on top of each other.
    const MIN_POINT_LABEL_GAP = 34;
    const showMaxLabel = maxIdx !== 0 && maxIdx !== n - 1
      && Math.abs(xAt(maxIdx) - xAt(0)) > MIN_POINT_LABEL_GAP
      && Math.abs(xAt(maxIdx) - xAt(n - 1)) > MIN_POINT_LABEL_GAP;

    let dotsHtml = '', pointLabelsHtml = '';
    points.forEach(function (p, i) {
      const x = xAt(i), y = yAt(p.weight);
      const attrs = ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" data-weight="' + p.weight + '" data-date="' + dateLabels[i] + '"';
      dotsHtml += '<circle class="cht-dot-hit" r="12"' + attrs + '></circle><circle class="cht-dot" r="3.5"' + attrs + '></circle>';

      if (shownIdx[i]) {
        html += '<text class="wh-freq-label" x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dateLabels[i] + '</text>';
      }
      if (i === 0 || i === n - 1 || (i === maxIdx && showMaxLabel)) {
        pointLabelsHtml += '<text class="cht-point-label" x="' + x.toFixed(1) + '" y="' + (y - 10).toFixed(1) + '" text-anchor="middle">' + p.weight + 'kg</text>';
      }
    });
    html += dotsHtml + pointLabelsHtml;

    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H);
    svg.innerHTML = html;

    svg.querySelectorAll('.cht-dot, .cht-dot-hit').forEach(function (dot) {
      dot.addEventListener('mouseenter', function () { showProgressionTooltip(dot); });
      dot.addEventListener('mouseleave', hideProgressionTooltip);
      dot.addEventListener('click', function (e) { e.stopPropagation(); showProgressionTooltip(dot); });
    });
  }

  function renderExerciseProgression() {
    const wrap = $('trExerciseProgressionWrap');
    if (!wrap) return;
    const grouped = window.WH.getPesasSetsGroupedByExercise ? window.WH.getPesasSetsGroupedByExercise() : {};
    const names = Object.keys(grouped);
    if (!names.length) {
      wrap.innerHTML = '<div class="po-empty">Registrá al menos una sesión de pesas para ver esto.</div>';
      return;
    }
    const selected = (wrap.dataset.selected && names.indexOf(wrap.dataset.selected) !== -1) ? wrap.dataset.selected : names[0];
    wrap.dataset.selected = selected;
    wrap.innerHTML =
      '<select id="trProgressionExSelect" class="tr-progression-select">'
      + names.map(function (n) { return '<option value="' + escapeHtml(n) + '"' + (n === selected ? ' selected' : '') + '>' + escapeHtml(n) + '</option>'; }).join('')
      + '</select>'
      + '<div class="po-empty hidden" id="trProgressionEmpty">Necesitás 2+ sesiones para ver progresión.</div>'
      + '<div class="wh-freq-wrap" id="trProgressionChartWrap">'
      +   '<svg class="wh-freq-svg" id="trProgressionSvg" viewBox="0 0 700 220"></svg>'
      +   '<div class="cht-tooltip" id="trProgressionTooltip"></div>'
      + '</div>';
    drawProgressionSvg(grouped[selected]);
    $('trProgressionExSelect').addEventListener('change', function (e) {
      wrap.dataset.selected = e.target.value;
      drawProgressionSvg(grouped[e.target.value]);
    });
  }

  function initMuscleDetailModal() {
    $('trMuscleDetailClose').addEventListener('click', function () { $('trMuscleDetailModalBg').classList.remove('show'); });
  }

  function init() {
    renderMuscleMapAfterWarmUp();
    initExerciseLibraryModals();
    initPesasLogModal();
    initMobilityLogModal();
    initCardioModal();
    initMuscleDetailModal();
    renderTrCards();
    renderTrHomeStats();
    renderPeriodCharts();
    renderBoxeoInsights();
    renderExerciseProgression();
    renderMobilityHistory();
    // Any remote gym_pesas_store pull/realtime update should refresh
    // anything derived from it (fatigue config may flip isPlaceholder,
    // mobility log may have new entries from another device).
    window.gpsOnChange = function () { renderMuscleMap(); renderTrHomeStats(); renderMobilityHistory(); };
    // Surfaces GymPesasStore's sync outcome (ok/pending/error) via the
    // discreet note appended inside renderMuscleMap() — see
    // appendSyncNoteIfError() above.
    window.gpsOnSyncStatusChange = function () { renderMuscleMap(); };

    // Re-draw the period-comparison charts (weekly volume, cardio minutes,
    // distance, Boxeo/Muay Thai load ring + trend) when the viewport
    // actually changes size — their SVG viewBox width is sized off the real
    // rendered width (see gymCharts.js), so it goes stale on resize/rotation
    // without this. Same debounce-then-redraw idea as health.html's sleep
    // chart ResizeObserver, but window-level since these scale with the
    // viewport, not an independently-resizable container.
    let periodChartResizeTimer = null;
    function redrawPeriodCharts() {
      clearTimeout(periodChartResizeTimer);
      periodChartResizeTimer = setTimeout(function () { renderPeriodCharts(); renderBoxeoInsights(); }, 150);
    }
    window.addEventListener('resize', redrawPeriodCharts);
    window.addEventListener('orientationchange', redrawPeriodCharts);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
