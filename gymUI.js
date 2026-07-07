// UI layer for the multi-discipline training module (gym.html). Loaded
// after the page's main inline <script> closes, so window.WH (the bridge
// into the existing workout_history pipeline) is already defined.
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

  // ---- One-tap button group (RIR/Fallo selector AND Boxeo/MuayThai
  // difficulty scale share this single implementation/visual language). ----
  const EFFORT_OPTIONS = [
    { value: 'RIR4', label: 'RIR 4' },
    { value: 'RIR3', label: 'RIR 3' },
    { value: 'RIR2', label: 'RIR 2' },
    { value: 'RIR1', label: 'RIR 1' },
    { value: 'fallo', label: 'Fallo' },
  ];
  const DIFFICULTY_OPTIONS = [
    { value: 1, label: '1 · Suave' },
    { value: 2, label: '2' },
    { value: 3, label: '3 · Media' },
    { value: 4, label: '4' },
    { value: 5, label: '5 · Muy duro' },
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

  // ---- Numeric stepper (weight/reps input during a pesas session) ----
  function renderNumericStepper(container, opts) {
    if (!container) return;
    opts = opts || {};
    let value = Number(opts.value) || 0;
    const step = Number(opts.step) || 1;
    const min = opts.min != null ? Number(opts.min) : 0;
    const suffix = opts.suffix || '';
    const onChange = opts.onChange || function () {};

    function paint() {
      const valEl = container.querySelector('.tr-num-value');
      if (valEl) valEl.textContent = value + (suffix ? ' ' + suffix : '');
    }
    container.innerHTML =
      '<button type="button" class="tr-num-btn tr-num-minus" aria-label="Restar">–</button>'
      + '<span class="tr-num-value"></span>'
      + '<button type="button" class="tr-num-btn tr-num-plus" aria-label="Sumar">+</button>';
    paint();
    container.querySelector('.tr-num-minus').addEventListener('click', function () {
      value = Math.max(min, value - step);
      paint(); onChange(value);
    });
    container.querySelector('.tr-num-plus').addEventListener('click', function () {
      value = value + step;
      paint(); onChange(value);
    });
  }

  window.showToast = showToast;
  window.renderButtonGroup = renderButtonGroup;
  window.EFFORT_OPTIONS = EFFORT_OPTIONS;
  window.DIFFICULTY_OPTIONS = DIFFICULTY_OPTIONS;
  window.renderNumericStepper = renderNumericStepper;

  // ============================================================
  // MUSCLE MAP
  // ============================================================
  function renderMuscleMap() {
    const wrap = $('trMuscleMapWrap');
    if (!wrap) return;

    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    const config = (window.GymData && window.GymData.getMuscleFatigueConfig)
      ? window.GymData.getMuscleFatigueConfig()
      : window.DEFAULT_MUSCLE_FATIGUE_CONFIG;
    const result = window.computeMuscleFatigue
      ? window.computeMuscleFatigue(sessions, config)
      : { isPlaceholder: true, muscles: {} };

    if (result.isPlaceholder) {
      // Never show invented colors/numbers before a real config exists.
      wrap.innerHTML =
        '<div class="po-empty">Cargá tu lógica de recuperación para activar esto</div>'
        + '<button class="po-btn-secondary" type="button" id="trMuscleMapConfigBtn" style="margin-top:10px;">Cargar configuración</button>';
      const btn = $('trMuscleMapConfigBtn');
      if (btn) btn.addEventListener('click', openMuscleConfigModal);
      return;
    }

    // A real config now exists. Full anatomical front/back SVG is a
    // possible future visual upgrade; this list already satisfies the
    // functional requirement — real, non-invented per-muscle scores, and
    // tapping a muscle filters to the exercises that train it.
    const groups = window.MUSCLE_GROUPS || [];
    wrap.innerHTML = '<div class="tr-muscle-list">' + groups.map(function (m) {
      const info = result.muscles[m] || { score: 0, lastTrainedAt: null };
      return '<div class="tr-muscle-row" data-muscle="' + escapeHtml(m) + '" role="button" tabindex="0" '
        + 'aria-label="' + escapeHtml(m) + ' — fatiga ' + Math.round(info.score) + '%" style="cursor:pointer;">'
        + '<span>' + escapeHtml(m) + '</span><span>' + Math.round(info.score) + '%</span></div>';
    }).join('') + '</div>';
    wrap.querySelectorAll('.tr-muscle-row').forEach(function (row) {
      row.addEventListener('click', function () { openMuscleDetailModal(row.dataset.muscle); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMuscleDetailModal(row.dataset.muscle); }
      });
    });
  }

  function openMuscleDetailModal(muscle) {
    $('trMuscleDetailTitle').textContent = muscle;
    const exercises = window.GymData.getExercisesByMuscle(muscle);
    const wrap = $('trMuscleDetailList');
    wrap.innerHTML = exercises.length
      ? exercises.map(function (ex) {
          const role = ex.primaryMuscle === muscle ? 'primario' : 'secundario';
          return '<div class="po-set-row"><span style="flex:1;font-size:13px;color:var(--text-1);">' + escapeHtml(ex.name)
            + ' <span style="color:var(--text-3);font-size:11px;">· ' + role + '</span></span></div>';
        }).join('')
      : '<div class="po-empty">Ningún ejercicio de tu biblioteca trabaja este músculo todavía.</div>';
    $('trMuscleDetailModalBg').classList.add('show');
  }

  function openMuscleConfigModal() {
    const modal = $('trMuscleConfigModalBg');
    if (!modal) return;
    const current = (window.GymData && window.GymData.getMuscleFatigueConfig) ? window.GymData.getMuscleFatigueConfig() : null;
    $('trMuscleConfigTextarea').value = current ? JSON.stringify(current, null, 2) : '';
    $('trMuscleConfigStatus').textContent = '';
    modal.classList.add('show');
  }
  function closeMuscleConfigModal() { $('trMuscleConfigModalBg').classList.remove('show'); }

  function initMuscleConfigModal() {
    const cancelBtn = $('trMuscleConfigCancel');
    const saveBtn = $('trMuscleConfigSave');
    if (cancelBtn) cancelBtn.addEventListener('click', closeMuscleConfigModal);
    if (saveBtn) saveBtn.addEventListener('click', function () {
      const statusEl = $('trMuscleConfigStatus');
      let parsed;
      try {
        parsed = JSON.parse($('trMuscleConfigTextarea').value);
      } catch (e) {
        statusEl.textContent = 'JSON inválido: ' + e.message;
        return;
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.muscles) {
        statusEl.textContent = 'El JSON debe tener al menos un campo "muscles".';
        return;
      }
      window.GymData.setMuscleFatigueConfig(parsed);
      statusEl.textContent = '';
      closeMuscleConfigModal();
      renderMuscleMap();
    });
  }

  // ============================================================
  // EXERCISE LIBRARY
  // ============================================================
  let editingExerciseId = null;

  function renderExerciseLibraryList() {
    const wrap = $('trExerciseLibraryList');
    if (!wrap) return;
    const exercises = window.GymData.getExercises();
    if (!exercises.length) {
      wrap.innerHTML = '<div class="po-empty">No hay ejercicios todavía. Creá el primero.</div>';
      return;
    }
    wrap.innerHTML = exercises.map(function (ex) {
      return '<div class="po-set-row" data-id="' + ex.id + '">'
        + '<span style="flex:1;min-width:0;font-size:13px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
        +   escapeHtml(ex.name) + ' <span style="color:var(--text-3);font-size:11px;">· ' + escapeHtml(ex.primaryMuscle || '—') + '</span>'
        + '</span>'
        + '<button type="button" class="po-mini-btn tr-ex-edit-btn" title="Editar">✎</button>'
        + '<button type="button" class="po-mini-btn tr-ex-delete-btn" title="Eliminar">×</button>'
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.tr-ex-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openExerciseEditModal(btn.closest('.po-set-row').dataset.id); });
    });
    wrap.querySelectorAll('.tr-ex-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.closest('.po-set-row').dataset.id;
        const ex = window.GymData.getExercise(id);
        if (ex && !confirm('¿Eliminar "' + ex.name + '"?')) return;
        window.GymData.deleteExercise(id);
        renderExerciseLibraryList();
      });
    });
  }

  function openExerciseLibraryModal() {
    renderExerciseLibraryList();
    $('trExerciseLibraryModalBg').classList.add('show');
  }
  function closeExerciseLibraryModal() { $('trExerciseLibraryModalBg').classList.remove('show'); }

  function openExerciseEditModal(existingId) {
    editingExerciseId = existingId || null;
    const ex = editingExerciseId ? window.GymData.getExercise(editingExerciseId) : null;
    $('trExerciseEditTitle').textContent = ex ? 'Editar ejercicio' : 'Nuevo ejercicio';
    $('trExName').value = ex ? ex.name : '';
    $('trExerciseEditStatus').textContent = '';

    const groups = window.MUSCLE_GROUPS || [];
    const primarySel = $('trExPrimaryMuscle');
    primarySel.innerHTML = groups.map(function (m) {
      return '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>';
    }).join('');
    primarySel.value = (ex && ex.primaryMuscle) || groups[0] || '';

    const secWrap = $('trExSecondaryMuscles');
    const currentSecondary = (ex && ex.secondaryMuscles) || [];
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
    const name = $('trExName').value.trim();
    if (!name) { $('trExerciseEditStatus').textContent = 'Poné un nombre.'; return; }
    const primaryMuscle = $('trExPrimaryMuscle').value;
    const secondaryMuscles = Array.prototype.slice.call($('trExSecondaryMuscles').querySelectorAll('.tr-chip.active'))
      .map(function (chip) { return chip.dataset.muscle; })
      .filter(function (m) { return m !== primaryMuscle; });

    if (editingExerciseId) {
      window.GymData.updateExercise(editingExerciseId, { name: name, primaryMuscle: primaryMuscle, secondaryMuscles: secondaryMuscles });
    } else {
      window.GymData.createExercise({ name: name, primaryMuscle: primaryMuscle, secondaryMuscles: secondaryMuscles });
    }
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

  // ============================================================
  // ROUTINE LIBRARY
  // ============================================================
  let editingRoutineId = null;

  function renderRoutineLibraryList() {
    const wrap = $('trRoutineLibraryList');
    if (!wrap) return;
    const routines = window.GymData.getRoutines();
    if (!routines.length) {
      wrap.innerHTML = '<div class="po-empty">No hay rutinas todavía. Creá la primera.</div>';
      return;
    }
    wrap.innerHTML = routines.map(function (rt) {
      const vNum = rt.versions.length ? rt.versions[rt.versions.length - 1].version : 0;
      return '<div class="po-set-row" data-id="' + rt.id + '">'
        + '<span style="flex:1;min-width:0;font-size:13px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
        +   escapeHtml(rt.name) + ' <span style="color:var(--text-3);font-size:11px;">· v' + vNum + '</span>'
        + '</span>'
        + '<button type="button" class="po-mini-btn tr-rt-edit-btn" title="Editar">✎</button>'
        + '<button type="button" class="po-mini-btn tr-rt-delete-btn" title="Eliminar">×</button>'
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.tr-rt-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openRoutineEditModal(btn.closest('.po-set-row').dataset.id); });
    });
    wrap.querySelectorAll('.tr-rt-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.closest('.po-set-row').dataset.id;
        const rt = window.GymData.getRoutine(id);
        if (rt && !confirm('¿Eliminar "' + rt.name + '"? Se pierde también su historial de versiones.')) return;
        window.GymData.deleteRoutine(id);
        renderRoutineLibraryList();
      });
    });
  }

  function openRoutineLibraryModal() {
    renderRoutineLibraryList();
    $('trRoutineLibraryModalBg').classList.add('show');
  }
  function closeRoutineLibraryModal() { $('trRoutineLibraryModalBg').classList.remove('show'); }

  function routineExRowHtml(row) {
    const exercises = window.GymData.getExercises();
    const options = exercises.map(function (ex) {
      const sel = ex.id === row.exerciseId ? ' selected' : '';
      return '<option value="' + ex.id + '"' + sel + '>' + escapeHtml(ex.name) + '</option>';
    }).join('');
    return '<div class="po-set-row tr-routine-ex-row" data-row-id="' + row.rowId + '">'
      + '<select class="tr-routine-ex-select">' + options + '</select>'
      + '<input type="number" class="tr-routine-ex-repmin" placeholder="min" value="' + (row.targetRepMin != null ? row.targetRepMin : '') + '" aria-label="Reps mínimas">'
      + '<input type="number" class="tr-routine-ex-repmax" placeholder="max" value="' + (row.targetRepMax != null ? row.targetRepMax : '') + '" aria-label="Reps máximas">'
      + '<input type="number" class="tr-routine-ex-weight" placeholder="kg" value="' + (row.targetWeight != null ? row.targetWeight : '') + '" aria-label="Peso objetivo (opcional)">'
      + '<button type="button" class="po-mini-btn tr-routine-ex-up" title="Subir">↑</button>'
      + '<button type="button" class="po-mini-btn tr-routine-ex-down" title="Bajar">↓</button>'
      + '<button type="button" class="po-mini-btn tr-routine-ex-remove" title="Quitar">×</button>'
      + '</div>';
  }

  let routineEditRows = []; // [{rowId, exerciseId, targetRepMin, targetRepMax, targetWeight}]
  let routineRowSeq = 0;

  function renderRoutineExRows() {
    const wrap = $('trRoutineExList');
    if (!wrap) return;
    if (!routineEditRows.length) {
      wrap.innerHTML = '<div class="po-empty">Agregá al menos un ejercicio.</div>';
      return;
    }
    wrap.innerHTML = routineEditRows.map(routineExRowHtml).join('');
    wrap.querySelectorAll('.tr-routine-ex-row').forEach(function (rowEl) {
      const rowId = rowEl.dataset.rowId;
      const row = routineEditRows.find(function (r) { return String(r.rowId) === rowId; });
      rowEl.querySelector('.tr-routine-ex-select').addEventListener('change', function (e) { row.exerciseId = e.target.value; });
      rowEl.querySelector('.tr-routine-ex-repmin').addEventListener('input', function (e) { row.targetRepMin = e.target.value === '' ? null : Number(e.target.value); });
      rowEl.querySelector('.tr-routine-ex-repmax').addEventListener('input', function (e) { row.targetRepMax = e.target.value === '' ? null : Number(e.target.value); });
      rowEl.querySelector('.tr-routine-ex-weight').addEventListener('input', function (e) { row.targetWeight = e.target.value === '' ? null : Number(e.target.value); });
      rowEl.querySelector('.tr-routine-ex-remove').addEventListener('click', function () {
        routineEditRows = routineEditRows.filter(function (r) { return r.rowId !== row.rowId; });
        renderRoutineExRows();
      });
      rowEl.querySelector('.tr-routine-ex-up').addEventListener('click', function () {
        const i = routineEditRows.indexOf(row);
        if (i > 0) { routineEditRows.splice(i, 1); routineEditRows.splice(i - 1, 0, row); renderRoutineExRows(); }
      });
      rowEl.querySelector('.tr-routine-ex-down').addEventListener('click', function () {
        const i = routineEditRows.indexOf(row);
        if (i !== -1 && i < routineEditRows.length - 1) { routineEditRows.splice(i, 1); routineEditRows.splice(i + 1, 0, row); renderRoutineExRows(); }
      });
    });
  }

  function openRoutineEditModal(existingId) {
    editingRoutineId = existingId || null;
    const rt = editingRoutineId ? window.GymData.getRoutine(editingRoutineId) : null;
    const currentVersion = (rt && window.GymData.getRoutineCurrentVersion(rt.id)) || null;
    $('trRoutineEditTitle').textContent = rt ? 'Editar rutina' : 'Nueva rutina';
    $('trRoutineName').value = rt ? rt.name : '';
    $('trRoutineEditStatus').textContent = '';

    routineEditRows = ((currentVersion && currentVersion.exercises) || []).map(function (ve) {
      return {
        rowId: ++routineRowSeq,
        exerciseId: ve.exerciseId,
        targetRepMin: ve.targetRepMin,
        targetRepMax: ve.targetRepMax,
        targetWeight: ve.targetWeight,
      };
    });
    renderRoutineExRows();
    $('trRoutineEditModalBg').classList.add('show');
  }
  function closeRoutineEditModal() { $('trRoutineEditModalBg').classList.remove('show'); }

  function saveRoutineEdit() {
    const name = $('trRoutineName').value.trim();
    if (!name) { $('trRoutineEditStatus').textContent = 'Poné un nombre.'; return; }
    if (!routineEditRows.length) { $('trRoutineEditStatus').textContent = 'Agregá al menos un ejercicio.'; return; }
    if (routineEditRows.some(function (r) { return !r.exerciseId; })) {
      $('trRoutineEditStatus').textContent = 'Creá al menos un ejercicio en la biblioteca primero.';
      return;
    }
    const exercisesPayload = routineEditRows.map(function (r) {
      return { exerciseId: r.exerciseId, targetRepMin: r.targetRepMin, targetRepMax: r.targetRepMax, targetWeight: r.targetWeight };
    });

    if (editingRoutineId) {
      window.GymData.updateRoutineName(editingRoutineId, name);
      // Any explicit save from this editor is an intentional template
      // revision — always creates a new version (append-only history).
      window.GymData.bumpRoutineVersion(editingRoutineId, exercisesPayload);
    } else {
      window.GymData.createRoutine({ name: name, exercises: exercisesPayload });
    }
    closeRoutineEditModal();
    renderRoutineLibraryList();
  }

  function initRoutineLibraryModals() {
    $('trOpenRoutineLibraryBtn').addEventListener('click', openRoutineLibraryModal);
    $('trRoutineLibraryClose').addEventListener('click', closeRoutineLibraryModal);
    $('trRoutineLibraryAddBtn').addEventListener('click', function () { openRoutineEditModal(null); });
    $('trRoutineEditCancel').addEventListener('click', closeRoutineEditModal);
    $('trRoutineEditSave').addEventListener('click', saveRoutineEdit);
    $('trRoutineAddExBtn').addEventListener('click', function () {
      const exercises = window.GymData.getExercises();
      if (!exercises.length) { $('trRoutineEditStatus').textContent = 'Creá al menos un ejercicio en la biblioteca primero.'; return; }
      routineEditRows.push({ rowId: ++routineRowSeq, exerciseId: exercises[0].id, targetRepMin: null, targetRepMax: null, targetWeight: null });
      renderRoutineExRows();
    });
  }

  // ============================================================
  // PESAS — active session flow
  // ============================================================
  let sessionExercises = [];   // [{rowId, exerciseId, name, primaryMuscle, secondaryMuscles, sets:[{reps,weight,rir}]}]
  let sessionDraft = {};       // rowId -> {weight, reps, rir} — the in-progress "next set" per exercise
  let sessionRoutineId = null;
  let sessionRoutineVersion = null; // the routine version object used to start this session (or null)
  let sessionRowSeq = 0;
  let restTimerHandle = null;
  let restTimerRemaining = 0;
  const REST_TIMER_DEFAULT = 90;

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
    const config = (window.GymData && window.GymData.getMuscleFatigueConfig) ? window.GymData.getMuscleFatigueConfig() : window.DEFAULT_MUSCLE_FATIGUE_CONFIG;
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

  function renderTrCards() {
    const wrap = $('trCards');
    if (!wrap) return;
    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    wrap.innerHTML = DISCIPLINE_CARDS.map(function (c) {
      return '<button type="button" class="tr-card" id="' + c.id + '">'
        + '<span class="tr-card-title">' + escapeHtml(c.title) + '</span>'
        + '<span class="tr-card-context">' + escapeHtml(cardContextFor(c.discipline, sessions)) + '</span>'
        + '</button>';
    }).join('');
    $('trCardPesas').addEventListener('click', openSessionPicker);
    $('trCardBoxeo').addEventListener('click', function () { openCardioModal('boxeo_muaythai'); });
    $('trCardBici').addEventListener('click', function () { openCardioModal('bici'); });
    $('trCardRunning').addEventListener('click', function () { openCardioModal('running'); });
  }

  // ---- Routine/free-session picker ----
  function openSessionPicker() {
    const wrap = $('trSessionPickerRoutineList');
    const routines = window.GymData.getRoutines();
    if (!routines.length) {
      wrap.innerHTML = '<div class="po-empty">No hay rutinas guardadas — arrancá una sesión libre, o creá una rutina primero en Settings → Entrenamiento.</div>';
    } else {
      wrap.innerHTML = routines.map(function (rt) {
        const v = window.GymData.getRoutineCurrentVersion(rt.id);
        const n = v ? v.exercises.length : 0;
        return '<div class="po-set-row" data-id="' + rt.id + '">'
          + '<span style="flex:1;min-width:0;font-size:13px;color:var(--text-1);">' + escapeHtml(rt.name)
          +   ' <span style="color:var(--text-3);font-size:11px;">· ' + n + ' ejercicio' + (n === 1 ? '' : 's') + '</span></span>'
          + '<button type="button" class="po-btn-secondary" style="width:auto;padding:6px 12px;" data-action="start">Empezar</button>'
          + '</div>';
      }).join('');
      wrap.querySelectorAll('[data-action="start"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = btn.closest('.po-set-row').dataset.id;
          closeSessionPicker();
          startSession(window.GymData.getRoutine(id));
        });
      });
    }
    $('trSessionPickerModalBg').classList.add('show');
  }
  function closeSessionPicker() { $('trSessionPickerModalBg').classList.remove('show'); }

  // ---- Active session ----
  function startSession(routine) {
    sessionRoutineId = routine ? routine.id : null;
    sessionRoutineVersion = routine ? window.GymData.getRoutineCurrentVersion(routine.id) : null;
    sessionExercises = ((sessionRoutineVersion && sessionRoutineVersion.exercises) || []).map(function (ve) {
      const libEx = window.GymData.getExercise(ve.exerciseId);
      return {
        rowId: ++sessionRowSeq,
        exerciseId: ve.exerciseId,
        name: libEx ? libEx.name : '(ejercicio eliminado)',
        primaryMuscle: libEx ? libEx.primaryMuscle : null,
        secondaryMuscles: libEx ? libEx.secondaryMuscles : [],
        sets: [],
      };
    });
    sessionDraft = {};
    $('trSessionTitle').textContent = routine ? routine.name : 'Sesión libre';
    stopRestTimer();
    renderSessionExercises();
    $('trSessionOverlay').classList.add('show');
  }
  function closeSession() {
    $('trSessionOverlay').classList.remove('show');
    stopRestTimer();
  }

  function sessionAddExercise() {
    const exercises = window.GymData.getExercises();
    if (!exercises.length) { alert('Creá al menos un ejercicio en Settings → Entrenamiento → Ejercicios primero.'); return; }
    const name = prompt('Ejercicio a agregar:\n' + exercises.map(function (e, i) { return (i + 1) + '. ' + e.name; }).join('\n') + '\n\nEscribí el número:');
    const idx = parseInt(name, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= exercises.length) return;
    const ex = exercises[idx];
    sessionExercises.push({
      rowId: ++sessionRowSeq, exerciseId: ex.id, name: ex.name,
      primaryMuscle: ex.primaryMuscle, secondaryMuscles: ex.secondaryMuscles, sets: [],
    });
    renderSessionExercises();
  }

  function sessionExRowHtml(row) {
    const setsHtml = row.sets.length
      ? row.sets.map(function (s, i) {
          return '<div class="tr-set-row"><span class="tr-set-row-num">' + (i + 1) + '</span>'
            + '<span>' + s.weight + 'kg × ' + s.reps + '</span>'
            + '<span class="tr-set-row-rir">' + (s.rir || '—') + '</span></div>';
        }).join('')
      : '<div class="po-empty" style="padding:6px 0;">Sin series todavía.</div>';
    return '<div class="tr-session-ex-block" data-row-id="' + row.rowId + '">'
      + '<div class="tr-session-ex-head">'
      +   '<span class="tr-session-ex-name">' + escapeHtml(row.name) + '</span>'
      +   '<span class="tr-session-ex-actions">'
      +     '<button type="button" class="po-mini-btn tr-sess-ex-up" title="Subir">↑</button>'
      +     '<button type="button" class="po-mini-btn tr-sess-ex-down" title="Bajar">↓</button>'
      +     '<button type="button" class="po-mini-btn tr-sess-ex-remove" title="Quitar">×</button>'
      +   '</span>'
      + '</div>'
      + '<div class="tr-sess-sets">' + setsHtml + '</div>'
      + '<div class="tr-set-log-row">'
      +   '<div class="tr-num-input" data-role="weight"></div>'
      +   '<div class="tr-num-input" data-role="reps"></div>'
      +   '<div class="tr-set-log-effort" data-role="effort"></div>'
      +   '<button type="button" class="po-btn-primary tr-sess-log-set" style="width:auto;padding:9px 16px;">+ Log set</button>'
      + '</div>'
      + '</div>';
  }

  function renderSessionExercises() {
    const wrap = $('trSessionExList');
    if (!sessionExercises.length) {
      wrap.innerHTML = '<div class="po-empty">Agregá al menos un ejercicio para empezar.</div>';
      return;
    }
    wrap.innerHTML = sessionExercises.map(sessionExRowHtml).join('');
    wrap.querySelectorAll('.tr-session-ex-block').forEach(function (blockEl) {
      const rowId = Number(blockEl.dataset.rowId);
      const row = sessionExercises.find(function (r) { return r.rowId === rowId; });
      if (!sessionDraft[rowId]) sessionDraft[rowId] = { weight: 20, reps: 8, rir: 'RIR2' };
      const draft = sessionDraft[rowId];

      window.renderNumericStepper(blockEl.querySelector('[data-role="weight"]'), {
        value: draft.weight, step: 2.5, min: 0, suffix: 'kg',
        onChange: function (v) { draft.weight = v; },
      });
      window.renderNumericStepper(blockEl.querySelector('[data-role="reps"]'), {
        value: draft.reps, step: 1, min: 0, suffix: 'reps',
        onChange: function (v) { draft.reps = v; },
      });
      window.renderButtonGroup(blockEl.querySelector('[data-role="effort"]'), window.EFFORT_OPTIONS, draft.rir, function (v) { draft.rir = v; });

      blockEl.querySelector('.tr-sess-log-set').addEventListener('click', function () {
        if (!draft.reps || draft.reps <= 0) { alert('Ingresá al menos 1 rep.'); return; }
        row.sets.push({ reps: draft.reps, weight: draft.weight, rir: draft.rir });
        renderSessionExercises();
        startRestTimer(REST_TIMER_DEFAULT);
        checkAndCelebrateWeightPR(row.name, draft.weight);
      });
      blockEl.querySelector('.tr-sess-ex-remove').addEventListener('click', function () {
        sessionExercises = sessionExercises.filter(function (r) { return r.rowId !== rowId; });
        renderSessionExercises();
      });
      blockEl.querySelector('.tr-sess-ex-up').addEventListener('click', function () {
        const i = sessionExercises.indexOf(row);
        if (i > 0) { sessionExercises.splice(i, 1); sessionExercises.splice(i - 1, 0, row); renderSessionExercises(); }
      });
      blockEl.querySelector('.tr-sess-ex-down').addEventListener('click', function () {
        const i = sessionExercises.indexOf(row);
        if (i !== -1 && i < sessionExercises.length - 1) { sessionExercises.splice(i, 1); sessionExercises.splice(i + 1, 0, row); renderSessionExercises(); }
      });
    });
  }

  function checkAndCelebrateWeightPR(exerciseName, weight) {
    if (!window.GymDomain || !window.WH) return;
    const allWorkouts = window.WH.getAllWorkouts();
    const result = window.GymDomain.checkWeightPR(exerciseName, weight, allWorkouts);
    if (result.isPR && weight > 0) {
      window.showToast('¡Nuevo PR de peso! ' + escapeHtml(exerciseName) + ' — ' + weight + 'kg', { celebrate: true });
    }
  }

  // ---- Rest timer ----
  function renderRestTimer() {
    const el = $('trRestTimer');
    if (restTimerRemaining <= 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('trRestTimerLabel').textContent = 'Descanso: ' + restTimerRemaining + 's';
  }
  function startRestTimer(seconds) {
    stopRestTimer();
    restTimerRemaining = seconds;
    renderRestTimer();
    restTimerHandle = setInterval(function () {
      restTimerRemaining--;
      if (restTimerRemaining <= 0) { stopRestTimer(); return; }
      renderRestTimer();
    }, 1000);
  }
  function stopRestTimer() {
    if (restTimerHandle) clearInterval(restTimerHandle);
    restTimerHandle = null;
    restTimerRemaining = 0;
    renderRestTimer();
  }

  // ---- Finish session: normalize, save, structural-diff check, PR toast ----
  function finishSession() {
    const usedExercises = sessionExercises.filter(function (r) { return r.sets.length > 0; });
    if (!usedExercises.length) { alert('Registrá al menos una serie antes de finalizar.'); return; }

    const allWorkoutsBefore = window.WH.getAllWorkouts();
    const exercisesPayload = usedExercises.map(function (r) {
      return { name: r.name, primaryMuscle: r.primaryMuscle, secondaryMuscles: r.secondaryMuscles, sets: r.sets.slice() };
    });

    const saveAndCelebrate = function (routineVersionUsed) {
      const workout = window.WH.normalizeWorkout({
        date: new Date().toISOString().slice(0, 10),
        title: sessionRoutineId ? ($('trSessionTitle').textContent || 'Pesas') : 'Sesión libre',
        source: 'manual',
        discipline: 'pesas',
        routineId: sessionRoutineId,
        routineVersion: routineVersionUsed ? routineVersionUsed.version : (sessionRoutineVersion ? sessionRoutineVersion.version : null),
        exercises: exercisesPayload,
      }, 'manual');
      window.WH.appendWorkout(workout);
      window.WH.commit();

      // PR celebration — volume PR per exercise, checked against history
      // BEFORE this session was saved.
      usedExercises.forEach(function (r) {
        const vol = r.sets.reduce(function (s, x) { return s + (x.weight || 0) * (x.reps || 0); }, 0);
        const volResult = window.GymDomain.checkVolumePR(r.name, vol, allWorkoutsBefore);
        if (volResult.isPR && vol > 0) {
          window.showToast('¡Nuevo PR de volumen! ' + escapeHtml(r.name), { celebrate: true });
        }
      });

      closeSession();
      renderTrCards();
      renderTrHomeStats();
      renderMuscleMap();
      renderPeriodCharts();
      renderExerciseProgression();
    };

    if (sessionRoutineId && sessionRoutineVersion) {
      const diff = window.GymDomain.detectRoutineStructuralDiff(sessionRoutineVersion, usedExercises.map(function (r) { return r.exerciseId; }));
      if (diff.changed) {
        const parts = [];
        if (diff.added.length) parts.push(diff.added.length + ' ejercicio(s) agregado(s)');
        if (diff.removed.length) parts.push(diff.removed.length + ' ejercicio(s) quitado(s)');
        if (diff.reordered) parts.push('orden cambiado');
        $('trRoutineDiffSummary').textContent = parts.join(', ') + '.';
        $('trRoutineDiffModalBg').classList.add('show');
        $('trRoutineDiffYes').onclick = function () {
          $('trRoutineDiffModalBg').classList.remove('show');
          // Carry over existing targets for exercises that were already in
          // the routine; new exercises get null targets (editable later).
          const oldByExId = {};
          (sessionRoutineVersion.exercises || []).forEach(function (ve) { oldByExId[ve.exerciseId] = ve; });
          const newVersionExercises = usedExercises.map(function (r) {
            const old = oldByExId[r.exerciseId];
            return {
              exerciseId: r.exerciseId,
              targetRepMin: old ? old.targetRepMin : null,
              targetRepMax: old ? old.targetRepMax : null,
              targetWeight: old ? old.targetWeight : null,
            };
          });
          const newVersion = window.GymData.bumpRoutineVersion(sessionRoutineId, newVersionExercises);
          saveAndCelebrate(newVersion);
        };
        $('trRoutineDiffNo').onclick = function () {
          $('trRoutineDiffModalBg').classList.remove('show');
          saveAndCelebrate(null);
        };
        return;
      }
    }
    saveAndCelebrate(null);
  }

  function initSessionFlow() {
    $('trSessionPickerCancel').addEventListener('click', closeSessionPicker);
    $('trSessionPickerFreeBtn').addEventListener('click', function () { closeSessionPicker(); startSession(null); });
    $('trSessionAddExBtn').addEventListener('click', sessionAddExercise);
    $('trSessionCancel').addEventListener('click', function () {
      if (!confirm('¿Salir sin guardar esta sesión?')) return;
      closeSession();
    });
    $('trSessionFinish').addEventListener('click', finishSession);
    $('trRestTimerMinus').addEventListener('click', function () { restTimerRemaining = Math.max(0, restTimerRemaining - 30); renderRestTimer(); });
    $('trRestTimerPlus').addEventListener('click', function () { restTimerRemaining += 30; renderRestTimer(); });
    $('trRestTimerSkip').addEventListener('click', stopRestTimer);
  }

  // ============================================================
  // BOXEO/MUAY THAI + RUNNING/BICI — one shared form, fields toggled by
  // discipline. Duration is the only required field for every mode.
  // ============================================================
  let cardioDiscipline = null; // 'boxeo_muaythai' | 'bici' | 'running'
  let cardioSubtype = 'boxeo'; // only meaningful for boxeo_muaythai
  let cardioDifficulty = 3;

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
      date: new Date().toISOString().slice(0, 10),
      title: CARDIO_TITLES[cardioDiscipline] || cardioDiscipline,
      source: 'manual',
      discipline: cardioDiscipline,
      notes: $('trCardioNotes').value.trim(),
      exercises: [],
      cardio: cardio,
    }, 'manual');
    window.WH.appendWorkout(workout);
    window.WH.commit();
    closeCardioModal();
    renderTrCards();
    renderTrHomeStats();
    renderMuscleMap();
    renderPeriodCharts();
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

  // ============================================================
  // ANALYTICS — period-comparison charts (one component, 3 instances) +
  // per-exercise PR progression.
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
      window.renderPeriodComparisonChart('trWeeklyVolSvg', { thisPeriod: vol.thisWeek, lastPeriod: vol.lastWeek, unit: 'kg' });
    }

    const cardioMin = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return w.cardio ? (w.cardio.duration || 0) : 0; },
      function (w) { return !!w.cardio; }
    );
    showOrEmpty('trCardioMinSvg', 'trCardioMinEmpty', cardioMin.thisWeek > 0 || cardioMin.lastWeek > 0);
    if (cardioMin.thisWeek > 0 || cardioMin.lastWeek > 0) {
      window.renderPeriodComparisonChart('trCardioMinSvg', { thisPeriod: cardioMin.thisWeek, lastPeriod: cardioMin.lastWeek, unit: 'min' });
    }

    const dist = window.GymDomain.computeWeekOverWeek(
      sessions,
      function (w) { return (w.cardio && w.cardio.distance != null) ? w.cardio.distance : 0; },
      function (w) { return w.discipline === 'running' || w.discipline === 'bici'; }
    );
    showOrEmpty('trDistanceSvg', 'trDistanceEmpty', dist.thisWeek > 0 || dist.lastWeek > 0);
    if (dist.thisWeek > 0 || dist.lastWeek > 0) {
      window.renderPeriodComparisonChart('trDistanceSvg', { thisPeriod: dist.thisWeek, lastPeriod: dist.lastWeek, unit: 'km' });
    }
  }

  function drawProgressionSvg(sets) {
    const svg = $('trProgressionSvg');
    if (!svg) return;
    const vals = sets.map(function (s) { return s.weight; });
    if (vals.length < 2) {
      svg.innerHTML = '<text x="150" y="50" text-anchor="middle" font-size="11" fill="var(--text-3)">Necesitás 2+ sesiones para ver progresión.</text>';
      return;
    }
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const range = max - min || 1;
    const W = 300, H = 100, pad = 8;
    const pts = vals.map(function (v, i) {
      const x = pad + (W - pad * 2) * (i / (vals.length - 1));
      const y = H - pad - (H - pad * 2) * ((v - min) / range);
      return [x, y];
    });
    const line = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    svg.innerHTML = '<path d="' + line + '" fill="none" stroke="var(--good)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>';
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
      '<select id="trProgressionExSelect" style="width:100%;margin-bottom:10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;color:var(--text-1);padding:8px;font-family:inherit;font-size:13px;">'
      + names.map(function (n) { return '<option value="' + escapeHtml(n) + '"' + (n === selected ? ' selected' : '') + '>' + escapeHtml(n) + '</option>'; }).join('')
      + '</select>'
      + '<svg viewBox="0 0 300 100" style="width:100%;height:100px;display:block;" id="trProgressionSvg"></svg>';
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
    renderMuscleMap();
    initMuscleConfigModal();
    initExerciseLibraryModals();
    initRoutineLibraryModals();
    initSessionFlow();
    initCardioModal();
    initMuscleDetailModal();
    renderTrCards();
    renderTrHomeStats();
    renderPeriodCharts();
    renderExerciseProgression();
    // Any remote gym_training_config pull/realtime update should refresh
    // the muscle map (it may flip isPlaceholder to false).
    window.gtOnChange = function () { renderMuscleMap(); renderTrHomeStats(); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
