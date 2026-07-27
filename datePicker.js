// Reusable date picker (Hoy / Ayer / Elegir fecha) — same HTML structure,
// CSS classes, and interaction model as the Steps module's date picker
// (stepsDateSeg/stepsCalPopover in gym.html), reimplemented here
// scoped-per-instance (not sharing Steps' single global popover state,
// which is private to gym.html's inline script and not reachable from
// this file) so it can be mounted more than once (Pesas log, Movilidad
// log, cardio form, po-water.html's day selector) without id collisions.
// Steps' own implementation is untouched — only its CSS classes are reused.
//
// Extracted verbatim from gymUI.js (Fase 4) so po-water.html can reuse it
// without loading gymUI.js, which is a foreign module for its domain. The
// only behavioral addition is the optional `options.onChange` callback and
// the `setSelectedDateKey` method it enables — everything else is an
// unmodified cut-and-paste.
(function () {
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

  // @param {Object} [options]
  // @param {(selectedDateKey: string) => void} [options.onChange] Invoked
  //   whenever the selected date changes (Hoy/Ayer/calendar-day clicks, or
  //   an external setSelectedDateKey() call) — never on mount itself.
  //   Omitting options/onChange keeps this 100% identical to the pre-Fase-4
  //   behavior of gymUI.js's Pesas/Movilidad/cardio date pickers.
  function createDatePicker(container, options) {
    options = options || {};
    const onChange = options.onChange;

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

    function setSelectedDate(d) {
      selectedDate = d;
      updatePillsUI();
      if (onChange) onChange(selectedDateKey());
    }

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
      // Additive (Fase 4): lets a caller outside the picker's own markup —
      // e.g. po-water.html's tappable 7-day history rows — select a date
      // through the exact same path (and onChange firing) as clicking Hoy/
      // Ayer/a calendar day. Future dates are silently ignored, mirroring
      // the calendar grid's own disabled-future-day guard above.
      setSelectedDateKey: function (key) {
        const d = dpParseKey(key);
        if (dpDateKey(d) > dpDateKey(new Date())) return;
        setSelectedDate(d);
      },
    };
  }

  window.createDatePicker = createDatePicker;
  window.dpDateOffset = dpDateOffset;
  window.dpDateKey = dpDateKey;
  window.dpParseKey = dpParseKey;
  window.dpFormatShort = dpFormatShort;
})();
