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

  // ---- One-tap button group (Boxeo/MuayThai difficulty scale uses this) ----
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

  window.showToast = showToast;
  window.renderButtonGroup = renderButtonGroup;
  window.DIFFICULTY_OPTIONS = DIFFICULTY_OPTIONS;

  // ---- Reusable date picker (Hoy / Ayer / Elegir fecha) — same HTML
  // structure, CSS classes, and interaction model as the Steps module's
  // date picker (stepsDateSeg/stepsCalPopover in gym.html), reimplemented
  // here scoped-per-instance (not sharing Steps' single global popover
  // state, which is private to gym.html's inline script and not reachable
  // from this file) so it can be mounted more than once (Pesas log,
  // Movilidad log, cardio form) without id collisions. Steps' own
  // implementation is untouched — only its CSS classes are reused.
  const DP_DOW_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DP_MONTH_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const DP_MONTH_FULL_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function dpDateOffset(days) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return d;
  }
  function dpDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dpParseKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function dpFormatShort(d) { return d.getDate() + ' ' + DP_MONTH_SHORT_ES[d.getMonth()].toLowerCase(); }

  function createDatePicker(container) {
    container.innerHTML =
      '<div class="steps-date-row">'
      + '<div class="po-seg-control steps-date-seg" role="group" aria-label="Elegir día">'
      +   '<button type="button" class="po-seg-btn active" data-role="today" aria-pressed="true">Hoy</button>'
      +   '<button type="button" class="po-seg-btn" data-role="yesterday" aria-pressed="false">Ayer</button>'
      +   '<button type="button" class="po-seg-btn steps-pill-cal" data-role="calendar" aria-pressed="false" aria-haspopup="dialog" aria-expanded="false">'
      +     '<svg class="steps-cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      +     '<span data-role="cal-label">Elegir fecha</span>'
      +   '</button>'
      + '</div>'
      + '<div class="steps-popover hidden" data-role="popover" role="dialog" aria-modal="false" aria-label="Elegir fecha">'
      +   '<div class="steps-cal-head">'
      +     '<button type="button" class="steps-cal-nav" data-role="cal-prev" aria-label="Mes anterior">‹</button>'
      +     '<div class="steps-cal-month" data-role="cal-month"></div>'
      +     '<button type="button" class="steps-cal-nav" data-role="cal-next" aria-label="Mes siguiente">›</button>'
      +   '</div>'
      +   '<div class="steps-cal-grid" data-role="cal-grid"></div>'
      + '</div>'
      + '</div>';

    function q(role) { return container.querySelector('[data-role="' + role + '"]'); }

    let selectedDate = dpDateOffset(0);
    let calViewYear, calViewMonth;

    function selectedDateKey() { return dpDateKey(selectedDate); }

    function updatePillsUI() {
      const key = selectedDateKey();
      const isToday = key === dpDateKey(dpDateOffset(0));
      const isYest = !isToday && key === dpDateKey(dpDateOffset(-1));
      const isOther = !isToday && !isYest;
      q('today').classList.toggle('active', isToday); q('today').setAttribute('aria-pressed', String(isToday));
      q('yesterday').classList.toggle('active', isYest); q('yesterday').setAttribute('aria-pressed', String(isYest));
      q('calendar').classList.toggle('active', isOther); q('calendar').setAttribute('aria-pressed', String(isOther));
      q('cal-label').textContent = isOther ? dpFormatShort(selectedDate) : 'Elegir fecha';
    }

    function setSelectedDate(d) { selectedDate = d; updatePillsUI(); }

    function renderCal() {
      const y = calViewYear, m = calViewMonth;
      q('cal-month').textContent = DP_MONTH_FULL_ES[m] + ' ' + y;
      const now = new Date();
      q('cal-next').disabled = (y === now.getFullYear() && m === now.getMonth());
      const startDow = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const todayKey = dpDateKey(now);
      const selKey = selectedDateKey();
      let html = DP_DOW_ES.map(function (l) { return '<div class="steps-cal-dow">' + l + '</div>'; }).join('');
      for (let i = 0; i < startDow; i++) html += '<div class="steps-cal-cell"></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const key = dpDateKey(new Date(y, m, d));
        const isFuture = key > todayKey;
        const cls = ['steps-cal-day'];
        if (key === selKey) cls.push('selected');
        if (key === todayKey) cls.push('today');
        html += '<div class="steps-cal-cell"><button type="button" class="' + cls.join(' ') + '"'
          + (isFuture ? ' disabled aria-disabled="true"' : ' data-key="' + key + '"')
          + '>' + d + '</button></div>';
      }
      q('cal-grid').innerHTML = html;
      q('cal-grid').querySelectorAll('.steps-cal-day:not([disabled])').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setSelectedDate(dpParseKey(btn.dataset.key));
          closePopover();
        });
      });
    }

    function outsideClick(e) {
      if (q('popover').contains(e.target) || q('calendar').contains(e.target)) return;
      closePopover();
    }
    function openPopover() {
      q('popover').classList.remove('hidden');
      requestAnimationFrame(function () { q('popover').classList.add('open'); });
      q('calendar').setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', outsideClick, true);
    }
    function closePopover() {
      q('popover').classList.remove('open');
      q('calendar').setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outsideClick, true);
      setTimeout(function () { if (!q('popover').classList.contains('open')) q('popover').classList.add('hidden'); }, 160);
    }

    q('today').addEventListener('click', function () { setSelectedDate(dpDateOffset(0)); });
    q('yesterday').addEventListener('click', function () { setSelectedDate(dpDateOffset(-1)); });
    q('calendar').addEventListener('click', function () {
      calViewYear = selectedDate.getFullYear();
      calViewMonth = selectedDate.getMonth();
      renderCal();
      openPopover();
    });
    q('cal-prev').addEventListener('click', function () { calViewMonth--; if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; } renderCal(); });
    q('cal-next').addEventListener('click', function () { calViewMonth++; if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; } renderCal(); });

    updatePillsUI();

    return {
      getSelectedDate: function () { return selectedDate; },
      getSelectedDateKey: selectedDateKey,
      reset: function () { setSelectedDate(dpDateOffset(0)); },
    };
  }

  // ============================================================
  // MUSCLE MAP
  // ============================================================
  function renderMuscleMap() {
    const wrap = $('trMuscleMapWrap');
    if (!wrap) return;

    const sessions = (window.WH && window.WH.getAllWorkouts) ? window.WH.getAllWorkouts() : [];
    const config = (window.GymPesasStore && window.GymPesasStore.getMuscleFatigueConfig)
      ? window.GymPesasStore.getMuscleFatigueConfig()
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

  function openMuscleConfigModal() {
    const modal = $('trMuscleConfigModalBg');
    if (!modal) return;
    const current = (window.GymPesasStore && window.GymPesasStore.getMuscleFatigueConfig) ? window.GymPesasStore.getMuscleFatigueConfig() : null;
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
      window.GymPesasStore.setMuscleFatigueConfig(parsed);
      statusEl.textContent = '';
      closeMuscleConfigModal();
      renderMuscleMap();
    });
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
  let pesasLogRows = [];   // [{rowId, name, sets:[{reps,weight}]}]
  let pesasLogRowSeq = 0;
  let pesasLogDatePicker = null; // lazily created, reset to "Hoy" every time

  function openPesasLogModal() {
    pesasLogRows = [{ rowId: ++pesasLogRowSeq, name: '', sets: [{ reps: 8, weight: 20 }] }];
    renderPesasLogRows();
    $('trPesasLogStatus').textContent = '';
    if (!pesasLogDatePicker) pesasLogDatePicker = createDatePicker($('trPesasLogDatePicker'));
    pesasLogDatePicker.reset();
    refreshExerciseNameDatalist();
    $('trPesasLogModalBg').classList.add('show');
  }
  function closePesasLogModal() { $('trPesasLogModalBg').classList.remove('show'); }

  function pesasLogRowHtml(row) {
    const setsHtml = row.sets.map(function (s, i) {
      return '<div class="tr-pesas-set-row" data-set-i="' + i + '">'
        + '<span class="tr-set-row-num">' + (i + 1) + '</span>'
        + '<input type="number" class="tr-pesas-set-reps" value="' + s.reps + '" min="0" placeholder="reps" aria-label="Reps">'
        + '<input type="number" class="tr-pesas-set-weight" value="' + s.weight + '" min="0" step="0.5" placeholder="kg" aria-label="Peso (kg)">'
        + '<button type="button" class="po-mini-btn tr-pesas-set-remove" title="Quitar serie">×</button>'
        + '</div>';
    }).join('');
    return '<div class="tr-session-ex-block" data-row-id="' + row.rowId + '">'
      + '<div class="tr-session-ex-head">'
      +   '<input type="text" class="tr-pesas-ex-name" list="trExerciseNameOptions" placeholder="Nombre del ejercicio" value="' + escapeHtml(row.name) + '">'
      +   '<button type="button" class="po-mini-btn tr-pesas-ex-remove" title="Quitar ejercicio">×</button>'
      + '</div>'
      + '<div class="tr-pesas-sets">' + setsHtml + '</div>'
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
        const lastWeight = row.sets.length ? row.sets[row.sets.length - 1].weight : 20;
        row.sets.push({ reps: 8, weight: lastWeight });
        renderPesasLogRows();
      });
      blockEl.querySelectorAll('.tr-pesas-set-row').forEach(function (setEl) {
        const i = Number(setEl.dataset.setI);
        setEl.querySelector('.tr-pesas-set-reps').addEventListener('input', function (e) { row.sets[i].reps = Number(e.target.value) || 0; });
        setEl.querySelector('.tr-pesas-set-weight').addEventListener('input', function (e) { row.sets[i].weight = Number(e.target.value) || 0; });
        setEl.querySelector('.tr-pesas-set-remove').addEventListener('click', function () {
          row.sets.splice(i, 1);
          renderPesasLogRows();
        });
      });
    });
  }

  function pesasLogAddExercise() {
    pesasLogRows.push({ rowId: ++pesasLogRowSeq, name: '', sets: [{ reps: 8, weight: 20 }] });
    renderPesasLogRows();
  }

  function savePesasLog() {
    const date = pesasLogDatePicker ? pesasLogDatePicker.getSelectedDateKey() : new Date().toISOString().slice(0, 10);
    const rawExercises = pesasLogRows
      .map(function (r) { return { name: r.name.trim(), sets: r.sets.filter(function (s) { return s.reps > 0; }) }; })
      .filter(function (r) { return r.name && r.sets.length; });
    if (!rawExercises.length) { $('trPesasLogStatus').textContent = 'Agregá al menos un ejercicio con una serie válida.'; return; }

    const allWorkoutsBefore = window.WH.getAllWorkouts();
    const partitioned = window.GymPesasStore.partitionWorkoutExercises(date, rawExercises);

    if (partitioned.mobilityEntries.length) window.GymPesasStore.addMobilityLogEntries(partitioned.mobilityEntries);

    if (partitioned.keptExercises.length) {
      const workout = window.WH.normalizeWorkout({
        date: date, title: 'Pesas', source: 'manual', discipline: 'pesas', exercises: partitioned.keptExercises,
      }, 'manual');
      window.WH.appendWorkout(workout);
      window.WH.commit();

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
    renderExerciseProgression();
    renderMobilityHistory();
  }

  function initPesasLogModal() {
    $('trPesasLogAddExBtn').addEventListener('click', pesasLogAddExercise);
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
    initPesasLogModal();
    initMobilityLogModal();
    initCardioModal();
    initMuscleDetailModal();
    renderTrCards();
    renderTrHomeStats();
    renderPeriodCharts();
    renderExerciseProgression();
    renderMobilityHistory();
    // Any remote gym_pesas_store pull/realtime update should refresh
    // anything derived from it (fatigue config may flip isPlaceholder,
    // mobility log may have new entries from another device).
    window.gpsOnChange = function () { renderMuscleMap(); renderTrHomeStats(); renderMobilityHistory(); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
