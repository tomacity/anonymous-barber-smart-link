(() => {
  const params = new URLSearchParams(window.location.search);
  const projectKey = params.get('project_key') || '';
  const appointmentToken = params.get('appointment_token') || '';
  const appointmentAction = params.get('appointment_action') || '';
  const apiOverride =
    (params.get('api') || '').replace(/\/$/, '');

  const apiBases = apiOverride
    ? [apiOverride]
    : [
        'https://zisto.gr',
        'https://zisto-gr.vercel.app',
        'https://zisto-hero-glance-main.vercel.app',
        'https://preview.zisto.app',
      ];

  let activeApiBase = null;

  const liveUrl =
    window.location.origin +
    window.location.pathname;

  async function postApi(payload, options = {}) {
    const candidates = activeApiBase
      ? [
          activeApiBase,
          ...apiBases.filter(
            (base) => base !== activeApiBase
          ),
        ]
      : apiBases;

    let lastNetworkError = null;

    for (const base of candidates) {
      try {
        const response = await fetch(
          base + '/api/track',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'text/plain;charset=UTF-8',
            },
            body: JSON.stringify(payload),
            keepalive:
              options.keepalive === true,
          }
        );

        const contentType =
          response.headers.get(
            'content-type'
          ) || '';

        const looksLikeApi =
          contentType.includes(
            'application/json'
          );

        if (
          !looksLikeApi &&
          [401, 403, 404, 405, 500, 502, 503, 504].includes(
            response.status
          )
        ) {
          continue;
        }

        activeApiBase = base;
        return response;
      } catch (error) {
        lastNetworkError = error;
      }
    }

    throw (
      lastNetworkError ||
      new Error(
        'Could not reach the Zisto booking API.'
      )
    );
  }

  const sessionId =
    getOrCreateId(
      sessionStorage,
      'zisto_session_id'
    );

  const visitorId =
    getOrCreateId(
      localStorage,
      'zisto_visitor_id'
    );

  function getOrCreateId(storage, key) {
    let value = storage.getItem(key);

    if (!value) {
      value =
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID ===
          'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;

      storage.setItem(key, value);
    }

    return value;
  }

  function track(eventType, metadata = {}) {
    void postApi(
      {
        project_key: projectKey,
        live_url: liveUrl,
        event_type: eventType,
        session_id: sessionId,
        visitor_id: visitorId,
        page_url:
          liveUrl,
        page_path:
          window.location.pathname,
        referrer:
          document.referrer || '',
        metadata,
      },
      {
        keepalive: true,
      }
    ).catch(() => {});
  }

  track('page_view');

  const state = {
    config: null,
    step: 'services',
    service: null,
    staff: null,
    date: null,
    time: null,
    manage: null,
    manageDate: null,
    manageTime: null,
  };

  const backdrop = document.getElementById('booking-backdrop');
  const panel = backdrop.querySelector('.booking-panel');
  const content = document.getElementById('booking-content');
  const progress = [...document.querySelectorAll('.booking-progress span')];

  document.querySelectorAll('.js-book').forEach((button) => {
    button.addEventListener('click', () => {
      track('button_click', {
        action: 'book_appointment',
        label:
          button.textContent?.trim() ||
          'BOOK',
      });

      openBooking();
    });
  });

  document.getElementById('close-booking').addEventListener('click', closeBooking);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeBooking();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !backdrop.hidden) closeBooking();
  });

  if (
    appointmentToken &&
    (appointmentAction === 'reschedule' ||
      appointmentAction === 'cancel')
  ) {
    void openAppointmentManagement();
  }

  async function openAppointmentManagement() {
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    setProgress(0);
    content.innerHTML = '<div class="booking-loading"><div class="spinner"></div><p>Loading appointment…</p></div>';

    try {
      const response = await postApi({
        action: 'appointment_manage',
        appointment_token: appointmentToken,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Could not load appointment'
        );
      }

      state.manage = data;

      if (
        data.appointment?.status ===
        'cancelled'
      ) {
        renderManageMessage(
          'APPOINTMENT CANCELLED',
          'This appointment has already been cancelled.'
        );
        return;
      }

      if (data.can_manage === false) {
        renderManageMessage(
          'APPOINTMENT LOCKED',
          'This appointment can no longer be changed or cancelled.'
        );
        return;
      }

      if (
        appointmentAction ===
        'cancel'
      ) {
        renderPublicCancel();
      } else {
        renderPublicReschedule();
      }
    } catch (error) {
      renderSetupError(
        'Could not load appointment.',
        error.message ||
        'Please try again later.'
      );
    }
  }

  function renderManageMessage(title, copy) {
    content.innerHTML = `
      <div class="booking-success">
        <div class="success-mark">✓</div>
        <p class="booking-kicker">ZISTO APPOINTMENTS</p>
        <h3>${escapeHtml(title)}</h3>
        <p class="step-copy">${escapeHtml(copy)}</p>
        <button type="button" class="primary-button" id="manage-done">DONE</button>
      </div>
    `;

    document
      .getElementById('manage-done')
      .addEventListener(
        'click',
        closeBooking
      );
  }

  function renderPublicCancel() {
    const appointment =
      state.manage?.appointment;
    const business =
      state.manage?.business;

    const startsAt =
      new Date(
        appointment.starts_at
      );

    content.innerHTML = `
      <div class="booking-step">
        <p class="step-number">MANAGE APPOINTMENT</p>
        <h3>CANCEL APPOINTMENT?</h3>
        <p class="step-copy">
          ${escapeHtml(business?.name || '')}
        </p>

        <div class="booking-summary">
          <strong>${escapeHtml(appointment.service?.name || 'Appointment')}</strong><br>
          ${escapeHtml(formatManageDate(startsAt))} ·
          ${escapeHtml(formatManageTime(startsAt))}
          ${appointment.staff?.name ? '<br>' + escapeHtml(appointment.staff.name) : ''}
        </div>

        <p class="booking-error" id="manage-error" hidden></p>

        <div class="form-actions">
          <button type="button" class="back-step" id="keep-appointment">
            KEEP APPOINTMENT
          </button>
          <button type="button" class="confirm-button" id="confirm-public-cancel">
            CANCEL APPOINTMENT
          </button>
        </div>
      </div>
    `;

    document
      .getElementById('keep-appointment')
      .addEventListener(
        'click',
        closeBooking
      );

    document
      .getElementById('confirm-public-cancel')
      .addEventListener(
        'click',
        submitPublicCancel
      );
  }

  async function submitPublicCancel() {
    const button =
      document.getElementById(
        'confirm-public-cancel'
      );

    const errorBox =
      document.getElementById(
        'manage-error'
      );

    button.disabled = true;
    button.textContent = 'CANCELLING…';
    errorBox.hidden = true;

    try {
      const response = await postApi({
        action:
          'appointment_public_cancel',
        appointment_token:
          appointmentToken,
      });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Cancellation failed'
        );
      }

      track('button_click', {
        action:
          'appointment_cancelled',
      });

      renderManageMessage(
        'APPOINTMENT CANCELLED',
        'Your appointment has been cancelled successfully.'
      );
    } catch (error) {
      errorBox.textContent =
        humanizeError(
          error.message ||
          'Cancellation failed'
        );

      errorBox.hidden = false;
      button.disabled = false;
      button.textContent =
        'CANCEL APPOINTMENT';
    }
  }

  function renderPublicReschedule() {
    const appointment =
      state.manage?.appointment;

    if (!appointment?.service) {
      renderSetupError(
        'Could not change appointment.',
        'The service is no longer available.'
      );
      return;
    }

    const dates =
      buildManageDates();

    if (
      !state.manageDate ||
      !dates.some(
        (date) =>
          sameDate(
            date,
            state.manageDate
          )
      )
    ) {
      state.manageDate =
        dates[0] || null;
    }

    const dateButtons =
      dates
        .slice(0, 10)
        .map(
          (date) => `
            <button
              type="button"
              class="date-button${sameDate(date, state.manageDate) ? ' selected' : ''}"
              data-manage-date="${date.toISOString()}"
            >
              <span>${weekdayShort(date)}</span>
              <strong>${date.getDate()}</strong>
            </button>
          `
        )
        .join('');

    const slots =
      state.manageDate
        ? buildManageSlots(
            state.manageDate
          )
        : [];

    const slotButtons =
      slots.length
        ? slots
            .map(
              (slot) => `
                <button
                  type="button"
                  class="time-button"
                  data-manage-minute="${slot.minutes}"
                >
                  ${escapeHtml(slot.label)}
                </button>
              `
            )
            .join('')
        : '<p class="step-copy">No available times for this day.</p>';

    content.innerHTML = `
      <div class="booking-step">
        <p class="step-number">MANAGE APPOINTMENT</p>
        <h3>CHANGE DATE &amp; TIME</h3>
        <p class="step-copy">
          ${escapeHtml(appointment.service.name)}
          ${appointment.staff?.name ? ' · ' + escapeHtml(appointment.staff.name) : ''}
        </p>

        <div class="date-strip">
          ${dateButtons}
        </div>

        <div class="time-grid">
          ${slotButtons}
        </div>

        <p class="booking-error" id="manage-error" hidden></p>
      </div>
    `;

    content
      .querySelectorAll(
        '[data-manage-date]'
      )
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            state.manageDate =
              new Date(
                button.dataset.manageDate
              );
            state.manageTime = null;
            renderPublicReschedule();
          }
        );
      });

    content
      .querySelectorAll(
        '[data-manage-minute]'
      )
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            state.manageTime = {
              minutes: Number(
                button.dataset.manageMinute
              ),
              label:
                button.textContent.trim(),
            };

            void submitPublicReschedule();
          }
        );
      });
  }

  function buildManageDates() {
    const availability =
      state.manage?.availability || [];

    const result = [];
    const now = new Date();
    const staffId =
      state.manage?.appointment?.staff?.id ||
      null;

    for (
      let i = 0;
      i < 28 && result.length < 14;
      i += 1
    ) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + i
      );

      const weekday =
        date.getDay();

      const hasWindow =
        availability.some(
          (window) => {
            if (
              Number(window.weekday) !==
              weekday
            ) {
              return false;
            }

            if (
              window.staff_id &&
              staffId &&
              window.staff_id !==
                staffId
            ) {
              return false;
            }

            if (
              window.staff_id &&
              !staffId
            ) {
              return false;
            }

            return true;
          }
        );

      if (
        hasWindow &&
        buildManageSlots(date).length > 0
      ) {
        result.push(date);
      }
    }

    return result;
  }

  function isBusySlot(
    candidate,
    durationMinutes,
    busyItems,
    staffId
  ) {
    const candidateEnd =
      new Date(
        candidate.getTime() +
          durationMinutes * 60_000
      );

    return (busyItems || []).some(
      (busy) => {
        const sameResource =
          staffId
            ? busy.staff_id === staffId
            : !busy.staff_id;

        if (!sameResource) {
          return false;
        }

        const busyStart =
          new Date(busy.starts_at);

        const busyEnd =
          new Date(busy.ends_at);

        return (
          candidate < busyEnd &&
          candidateEnd > busyStart
        );
      }
    );
  }

  function buildManageSlots(date) {
    const availability =
      state.manage?.availability || [];

    const duration = Number(
      state.manage?.appointment
        ?.service?.duration_minutes ||
      30
    );

    const staffId =
      state.manage?.appointment?.staff?.id ||
      null;

    const weekday =
      date.getDay();

    const windows =
      availability.filter(
        (window) => {
          if (
            Number(window.weekday) !==
            weekday
          ) {
            return false;
          }

          if (
            window.staff_id &&
            staffId &&
            window.staff_id !== staffId
          ) {
            return false;
          }

          if (
            window.staff_id &&
            !staffId
          ) {
            return false;
          }

          return true;
        }
      );

    const slots = [];
    const now = new Date();

    windows.forEach((window) => {
      const start =
        timeToMinutes(
          window.starts_at
        );

      const end =
        timeToMinutes(
          window.ends_at
        );

      if (
        start == null ||
        end == null
      ) {
        return;
      }

      for (
        let minute = start;
        minute + duration <= end;
        minute += 30
      ) {
        const candidate =
          combineDateAndTime(
            date,
            minute
          );

        if (
          candidate.getTime() <=
          now.getTime() +
            30 * 60 * 1000
        ) {
          continue;
        }

        if (
          isBusySlot(
            candidate,
            duration,
            state.manage?.busy || [],
            staffId
          )
        ) {
          continue;
        }

        slots.push({
          minutes: minute,
          label:
            minutesToTime(minute),
        });
      }
    });

    return [
      ...new Map(
        slots.map((slot) => [
          slot.minutes,
          slot,
        ])
      ).values(),
    ].sort(
      (a, b) =>
        a.minutes - b.minutes
    );
  }

  async function submitPublicReschedule() {
    const errorBox =
      document.getElementById(
        'manage-error'
      );

    if (
      !state.manageDate ||
      !state.manageTime
    ) {
      return;
    }

    const start =
      combineDateAndTime(
        state.manageDate,
        state.manageTime.minutes
      );

    content
      .querySelectorAll('button')
      .forEach((button) => {
        button.disabled = true;
      });

    try {
      const response = await postApi({
        action:
          'appointment_public_reschedule',
        appointment_token:
          appointmentToken,
        starts_at:
          start.toISOString(),
      });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Could not change appointment'
        );
      }

      track('button_click', {
        action:
          'appointment_rescheduled',
      });

      renderManageMessage(
        'APPOINTMENT UPDATED',
        'Your appointment date and time have been changed successfully.'
      );
    } catch (error) {
      renderPublicReschedule();

      const refreshedError =
        document.getElementById(
          'manage-error'
        );

      refreshedError.textContent =
        humanizeError(
          error.message ||
          'Could not change appointment'
        );

      refreshedError.hidden = false;
    }
  }

  function formatManageDate(date) {
    return new Intl.DateTimeFormat(
      'en',
      {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    ).format(date);
  }

  function formatManageTime(date) {
    return new Intl.DateTimeFormat(
      'en',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }
    ).format(date);
  }

  async function openBooking() {
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    state.step = 'services';
    state.service = null;
    state.staff = null;
    state.date = null;
    state.time = null;
    setProgress(0);

    content.innerHTML = '<div class="booking-loading"><div class="spinner"></div><p>Loading availability…</p></div>';

    try {
      const response = await postApi({
        action: 'appointment_bootstrap',
        project_key: projectKey,
        live_url: liveUrl,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load booking');
      state.config = data;
      renderServices();

      if (Array.isArray(data.services) && data.services.length) {
        const serviceGrid = document.getElementById('service-grid');
        serviceGrid.innerHTML = data.services.slice(0, 3).map((service) => {
          const price = service.price_cents == null ? 'ASK' : '€' + (service.price_cents / 100).toFixed(service.price_cents % 100 ? 2 : 0);
          return `<article class="service-card">
            <div><h3>${escapeHtml(service.name)}</h3><p>Book this service directly through the Zisto Smart Link.</p></div>
            <div class="service-meta"><span>${service.duration_minutes} min</span><span>${price}</span></div>
          </article>`;
        }).join('');
      }
    } catch (error) {
      renderSetupError('Booking is temporarily unavailable.', error.message || 'Please try again later.');
    }
  }

  function closeBooking() {
    backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function setProgress(index) {
    progress.forEach((item, i) => item.classList.toggle('active', i <= index));
  }

  function cloneTemplate(id) {
    const template = document.getElementById(id);
    content.innerHTML = '';
    content.appendChild(template.content.cloneNode(true));
    panel.scrollTop = 0;
  }

  function renderSetupError(title, copy) {
    content.innerHTML = `<div class="setup-error"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
  }

  function renderServices() {
    state.step = 'services';
    setProgress(0);
    cloneTemplate('step-services');
    const list = document.getElementById('booking-services');
    const services = state.config?.services || [];

    if (!services.length) {
      list.innerHTML = '<div class="setup-error"><strong>No services yet.</strong><span>Add services in the Zisto booking configuration before testing.</span></div>';
      return;
    }

    services.forEach((service) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'booking-option';
      const price = service.price_cents == null
        ? ''
        : '€' + (service.price_cents / 100).toFixed(service.price_cents % 100 ? 2 : 0);
      button.innerHTML = `<span><strong>${escapeHtml(service.name)}</strong><small>${service.duration_minutes} min</small></span><span class="price">${price}</span>`;
      button.addEventListener('click', () => {
        state.service = service;
        renderStaff();
      });
      list.appendChild(button);
    });
  }

  function renderStaff() {
    state.step = 'staff';
    setProgress(1);
    cloneTemplate('step-staff');
    const list = document.getElementById('booking-staff');
    const staff = state.config?.staff || [];

    if (!staff.length) {
      state.staff = null;
      renderTime();
      return;
    }

    staff.forEach((member) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'booking-option';
      button.innerHTML = `<span><strong>${escapeHtml(member.name)}</strong><small>BARBER</small></span><span>→</span>`;
      button.addEventListener('click', () => {
        state.staff = member;
        renderTime();
      });
      list.appendChild(button);
    });

    const any = document.createElement('button');
    any.type = 'button';
    any.className = 'booking-option';
    any.innerHTML = '<span><strong>FIRST AVAILABLE</strong><small>Choose the earliest available barber</small></span><span>→</span>';
    any.addEventListener('click', () => {
      state.staff = staff[0];
      renderTime();
    });
    list.appendChild(any);

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-step';
    back.textContent = '← BACK';
    back.addEventListener('click', renderServices);
    list.appendChild(back);
  }

  function renderTime() {
    state.step = 'time';
    setProgress(2);
    cloneTemplate('step-time');

    const dates = buildBookableDates();
    const dateWrap = document.getElementById('booking-dates');
    const timeWrap = document.getElementById('booking-times');

    if (!dates.length) {
      timeWrap.innerHTML = '<div class="setup-error"><strong>No opening hours configured.</strong><span>Add availability in Zisto before testing.</span></div>';
      return;
    }

    if (!state.date || !dates.some(d => sameDate(d, state.date))) state.date = dates[0];

    dates.slice(0, 10).forEach((date) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'date-button' + (sameDate(date, state.date) ? ' selected' : '');
      button.innerHTML = `<span>${weekdayShort(date)}</span><strong>${date.getDate()}</strong>`;
      button.addEventListener('click', () => {
        state.date = date;
        state.time = null;
        renderTime();
      });
      dateWrap.appendChild(button);
    });

    const slots = buildSlots(state.date);
    if (!slots.length) {
      timeWrap.innerHTML = '<p class="step-copy">No available times for this day.</p>';
    } else {
      slots.forEach((slot) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'time-button';
        button.textContent = slot.label;
        button.addEventListener('click', () => {
          state.time = slot;
          renderDetails();
        });
        timeWrap.appendChild(button);
      });
    }

    content.querySelector('[data-back="staff"]').addEventListener('click', renderStaff);
  }

  function renderDetails() {
    state.step = 'details';
    setProgress(3);
    cloneTemplate('step-details');

    const summary = document.getElementById('booking-summary');
    summary.innerHTML = [
      '<strong>' + escapeHtml(state.service?.name || '') + '</strong>',
      escapeHtml(formatDate(state.date)),
      escapeHtml(state.time?.label || ''),
      state.staff ? escapeHtml(state.staff.name) : '',
    ].filter(Boolean).join(' · ');

    content.querySelector('[data-back="time"]').addEventListener('click', renderTime);
    document.getElementById('details-form').addEventListener('submit', submitBooking);
  }

  async function submitBooking(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('.confirm-button');
    const errorBox = document.getElementById('booking-error');
    const formData = new FormData(form);

    submit.disabled = true;
    submit.textContent = 'BOOKING…';
    errorBox.hidden = true;

    const start = combineDateAndTime(state.date, state.time.minutes);

    try {
      const response = await postApi({
        action: 'appointment_book',
        project_key: projectKey,
        live_url: liveUrl,
        service_id: state.service.id,
        staff_id: state.staff?.id || '',
        customer_name: formData.get('customer_name'),
        customer_phone: formData.get('customer_phone'),
        customer_email: formData.get('customer_email'),
        notes: formData.get('notes'),
        starts_at: start.toISOString(),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Booking failed');
      track('button_click', {
        action:
          'appointment_booked',
        service:
          state.service?.name || '',
      });

      renderSuccess(data);
    } catch (error) {
      errorBox.textContent = humanizeError(error.message || 'Booking failed');
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = 'CONFIRM APPOINTMENT';
    }
  }

  function renderSuccess(data) {
    cloneTemplate('step-success');
    setProgress(3);
    const summary = document.getElementById('success-summary');
    summary.innerHTML = `<strong>${escapeHtml(data.service?.name || state.service?.name || '')}</strong><br>${escapeHtml(formatDate(state.date))} · ${escapeHtml(state.time?.label || '')}${state.staff ? '<br>' + escapeHtml(state.staff.name) : ''}`;
    document.getElementById('finish-booking').addEventListener('click', closeBooking);
  }

  function buildBookableDates() {
    const availability = state.config?.availability || [];
    const result = [];
    const now = new Date();

    for (let i = 0; i < 28 && result.length < 14; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const weekday = date.getDay();
      const hasWindow = availability.some((window) => {
        if (Number(window.weekday) !== weekday) return false;
        if (window.staff_id && state.staff?.id && window.staff_id !== state.staff.id) return false;
        if (window.staff_id && !state.staff) return false;
        return true;
      });
      if (
        hasWindow &&
        buildSlots(date).length > 0
      ) {
        result.push(date);
      }
    }
    return result;
  }

  function buildSlots(date) {
    const availability = state.config?.availability || [];
    const duration = Number(state.service?.duration_minutes || 30);
    const weekday = date.getDay();
    const windows = availability.filter((window) => {
      if (Number(window.weekday) !== weekday) return false;
      if (window.staff_id && state.staff?.id && window.staff_id !== state.staff.id) return false;
      if (window.staff_id && !state.staff) return false;
      return true;
    });

    const slots = [];
    const now = new Date();
    windows.forEach((window) => {
      const start = timeToMinutes(window.starts_at);
      const end = timeToMinutes(window.ends_at);
      if (start == null || end == null) return;

      for (let minute = start; minute + duration <= end; minute += 30) {
        const candidate = combineDateAndTime(date, minute);
        if (candidate.getTime() <= now.getTime() + 30 * 60 * 1000) continue;
        if (
          isBusySlot(
            candidate,
            duration,
            state.config?.busy || [],
            state.staff?.id || null
          )
        ) {
          continue;
        }

        slots.push({minutes: minute, label: minutesToTime(minute)});
      }
    });
    return [
      ...new Map(
        slots.map((slot) => [
          slot.minutes,
          slot,
        ])
      ).values(),
    ].sort(
      (a, b) =>
        a.minutes - b.minutes
    );
  }

  function combineDateAndTime(date, minutes) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Math.floor(minutes / 60),
      minutes % 60,
      0,
      0
    );
  }

  function timeToMinutes(value) {
    if (!value) return null;
    const [h, m] = String(value).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  function minutesToTime(value) {
    const h = Math.floor(value / 60);
    const m = value % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function weekdayShort(date) {
    return new Intl.DateTimeFormat('en', {weekday:'short'}).format(date).toUpperCase();
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('en', {weekday:'short', day:'2-digit', month:'short'}).format(date);
  }

  function sameDate(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function humanizeError(message) {
    const lower = String(message).toLowerCase();
    if (lower.includes('no longer available')) return 'That time was just booked. Please choose another slot.';
    if (lower.includes('outside available')) return 'That time is outside the available booking hours.';
    if (lower.includes('staff member is required')) return 'Please choose a barber.';
    if (lower.includes('too many booking attempts')) return 'Too many booking attempts. Please try again a little later.';
    if (lower.includes('can no longer be changed')) return 'This appointment can no longer be changed.';
    if (lower.includes('can no longer be cancelled')) return 'This appointment can no longer be cancelled.';
    return message;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    })[char]);
  }
})();
