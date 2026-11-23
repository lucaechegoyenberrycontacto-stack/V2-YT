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
  const BODY_VIEWBOX = '175 45 670 1400';
  const [BODY_FRONT_DECO,...BODY_FRONT_REGIONS] = FitnessAnatomy.front;
  const [BODY_BACK_DECO,...BODY_BACK_REGIONS] = FitnessAnatomy.back;

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
    { cls: 'tr-legend-none', label: 'Sin información' },
    { cls: 'tr-legend-rest', label: 'Carga baja' },
    { cls: 'tr-legend-mid', label: 'Carga intermedia' },
    { cls: 'tr-legend-high', label: 'Carga alta' },
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
      +     bodyDecoHtml([BODY_FRONT_DECO]) + bodyRegionsHtml(BODY_FRONT_REGIONS)
      +   '</svg>'
      +   '<svg class="tr-body-svg" data-view="back" viewBox="' + BODY_VIEWBOX + '" aria-hidden="true">'
      +     bodyDecoHtml([BODY_BACK_DECO]) + bodyRegionsHtml(BODY_BACK_REGIONS)
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
      const isActive = matchMedia('(min-width: 751px)').matches || svg.dataset.view === view;
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
      el.setAttribute('aria-label', muscle+' · '+MUSCLE_STATUS_LABELS[fill.color]);
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
    'var(--text-tertiary)': 'Sin información',
    'var(--success)': 'Carga baja',
    'var(--warning)': 'Carga intermedia',
    'var(--danger)': 'Carga alta',
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
    const ecosystemOverrides = Object.assign({'sleepEntries':null,'nut:log':null,'nut:foods':null,'nut:goals':null,po_habits_v1:null},window.ecosystemOverrides);
    const result = window.computeMuscleFatigue
      ? window.computeMuscleFatigue(sessions, config, undefined, ecosystemOverrides, name=>GymPesasStore.getExerciseInfo(name))
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
    wrap.querySelector('.fitness-muscles')?.remove();
    const list=document.createElement('details');
    list.className='fitness-muscles';
    list.innerHTML='<summary>Detalle por músculo</summary>';
    wrap.querySelector('.fitness-summary')?.remove();
    const summary=document.createElement('p');
    summary.className='fitness-summary';
    const top=Object.entries(result.muscles).filter(([,info])=>info.score>0).sort((a,b)=>b[1].score-a[1].score).slice(0,3);
    summary.textContent=top.length?'Mayor carga ahora · '+top.map(([name])=>name).join(', '):'Sin aportes recientes en los músculos asignados';
    wrap.append(summary);
    for(const [name,info] of Object.entries(result.muscles).sort((a,b)=>b[1].score-a[1].score)){
      const button=document.createElement('button');
      button.textContent=name+' · '+muscleStatusLabel(name);
      button.onclick=()=>openMuscleDetailModal(name);list.append(button);
    }
    if(result.unassigned.length){
      const note=document.createElement('p');note.textContent=result.coverage.assigned+' de '+result.coverage.performed+' ejercicios realizados con asignación. Faltan '+result.unassigned.join(', ');list.append(note);
    }
    wrap.append(list);

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

  let muscleTrigger;
  function openMuscleDetailModal(muscle) {
    const status = muscleStatusLabel(muscle);
    $('trMuscleDetailTitle').textContent = status ? muscle + ' — ' + status : muscle;
    const info=lastMuscleFatigueResult.muscles[muscle];
    const wrap=$('trMuscleDetailList');
    wrap.textContent=info.lastTrainedAt?'Último entrenamiento · '+info.lastTrainedAt:'Sin antecedentes registrados';
    for(const entry of info.evidence){
      const button=document.createElement('button');
      button.textContent=[entry.date,entry.title,entry.exercise,entry.role,entry.precision==='día'?'hora desconocida':null,entry.sets?entry.sets+' series':'',entry.modifier!==1?'Recuperación × '+entry.modifier.toFixed(2):''].filter(Boolean).join(' · ');
      button.onclick=()=>{$('trMuscleDetailModalBg').classList.remove('show');const i=entry.id?WH.getAllWorkouts().findIndex(w=>w.id===entry.id):entry.index;if(i>=0)openFitnessSession(i);};wrap.append(button);
    }
    muscleTrigger=document.activeElement;
    $('trMuscleDetailModalBg').classList.add('show');
    $('trMuscleDetailClose').focus();
  }

  // ============================================================
  // EXERCISE LIBRARY — simplified: name + músculo primario/secundario +
  // flag de movilidad. No hay rutinas ni versiones. Entries are keyed by
  // exercise name (seed + user overrides, via GymPesasStore), not a
  // synthetic id — an exercise's name is its identity across the app.
  // ============================================================
  let editingExerciseName = null;

  function renderExerciseLibraryList() {
    const wrap = $('trExerciseLibraryList');
    if (!wrap) return;
    const names = [...new Set([...GymPesasStore.getAllKnownNames(), ...WH.getAllWorkouts().flatMap(w=>w.exercises.map(e=>e.name))])].sort();
    if (!names.length) {
      wrap.innerHTML = '<div class="po-empty">Todavía no hay ejercicios registrados.</div>';
      return;
    }
    wrap.innerHTML = names.map(function (name) {
      const info = window.GymPesasStore.getExerciseInfo(name);
      let tag;
      if (!info.isAssigned) tag = '<span style="color:var(--bad);font-size:11px;">· Sin músculo asignado</span>';
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

    $('trExerciseEditModalBg').classList.add('show');
  }
  function closeExerciseEditModal() { $('trExerciseEditModalBg').classList.remove('show'); }

  function saveExerciseEdit() {
    let name;
    if (editingExerciseName) {
      name = editingExerciseName;
    } else {
      name = $('trExName').value.trim();
      if (!name) { $('trExerciseEditStatus').textContent = 'Poné un nombre.'; return; }
    }
    const primaryMuscle = $('trExPrimaryMuscle').value;
    const secondaryMuscles = Array.prototype.slice.call($('trExSecondaryMuscles').querySelectorAll('.tr-chip.active'))
      .map(function (chip) { return chip.dataset.muscle; })
      .filter(function (m) { return m !== primaryMuscle; });

    window.GymPesasStore.setExerciseOverride(name, { primaryMuscle: primaryMuscle, secondaryMuscles: secondaryMuscles });
    closeExerciseEditModal();
    renderExerciseLibraryList();
  }

  function initExerciseLibraryModals() {
    $('trOpenExerciseLibraryBtn').addEventListener('click', openExerciseLibraryModal);
    $('trExerciseLibraryClose').addEventListener('click', closeExerciseLibraryModal);
    $('trExerciseLibraryAddBtn').addEventListener('click', function () { openExerciseEditModal(null); });
    $('trExerciseEditCancel').addEventListener('click', closeExerciseEditModal);
    $('trExerciseEditSave').addEventListener('click', saveExerciseEdit);
  }

  function initMuscleDetailModal() {
    const close=()=>{ $('trMuscleDetailModalBg').classList.remove('show'); muscleTrigger?.focus(); };
    $('trMuscleDetailClose').onclick=close;
    $('trMuscleDetailModalBg').onkeydown=e=>{
      if(e.key==='Escape')close();
      if(e.key==='Tab'){
        const buttons=[...$('trMuscleDetailModalBg').querySelectorAll('button')];
        if(e.shiftKey && document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}
        else if(!e.shiftKey && document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}
      }
    };
  }

  function init() {
    matchMedia('(min-width: 751px)').addEventListener('change',()=>switchBodyView($('trMuscleMapWrap'),'front'));
    document.addEventListener('fitness-workouts-changed', function () {
      renderMuscleMap();
    });
    renderMuscleMapAfterWarmUp();
    initExerciseLibraryModals();
    initMuscleDetailModal();
    // Any remote gym_pesas_store pull/realtime update should refresh
    // anything derived from it (fatigue config may flip isPlaceholder,
    // mobility log may have new entries from another device).
    window.gpsOnChange = function () { renderMuscleMap(); };
    // Surfaces GymPesasStore's sync outcome (ok/pending/error) via the
    // discreet note appended inside renderMuscleMap() — see
    // appendSyncNoteIfError() above.
    window.gpsOnSyncStatusChange = function () { renderMuscleMap(); };

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
