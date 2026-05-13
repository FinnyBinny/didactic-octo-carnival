/* =============================================================
   Guzman Outdoors — site interactions
   - Mobile nav toggle
   - Quote form: client-side validation + Formspree submit
   - Year stamp in footer
   ============================================================= */
(function () {
  'use strict';

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Mobile nav
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  if (nav && navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('.nav-links a').forEach((a) => {
      a.addEventListener('click', () => {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Quote form
  // To go live, replace this with your Formspree (or similar) endpoint:
  //   https://formspree.io/f/XXXXXXXX
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/REPLACE_WITH_YOUR_ID';

  const form = document.getElementById('quoteForm');
  const status = document.getElementById('formStatus');
  const submitBtn = document.getElementById('quoteSubmit');

  function showError(id, msg) {
    const field = document.getElementById(id);
    if (!field) return;
    const wrap = field.closest('.field');
    if (wrap) wrap.classList.add('is-invalid');
    const err = form.querySelector(`.field-error[data-for="${id}"]`);
    if (err) err.textContent = msg;
  }
  function clearErrors() {
    form.querySelectorAll('.field.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
    form.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
    status.textContent = '';
    status.classList.remove('is-ok', 'is-err');
  }

  function validate(data) {
    let ok = true;
    if (!data.name || data.name.trim().length < 2) {
      showError('f_name', 'Please share your name.');
      ok = false;
    }
    if (!data.phone || data.phone.replace(/\D/g, '').length < 7) {
      showError('f_phone', 'A phone number we can reach you at.');
      ok = false;
    }
    if (!data.address || data.address.trim().length < 4) {
      showError('f_address', 'Where is the work happening?');
      ok = false;
    }
    return ok;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const fd = new FormData(form);
      // Honeypot — silent drop
      if (fd.get('company')) return;

      const services = fd.getAll('services');
      const data = {
        name: fd.get('name'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        address: fd.get('address'),
        services: services.join(', '),
        timing: fd.get('timing'),
        measured_area: fd.get('measured_area'),
        notes: fd.get('notes'),
        _subject: `New quote request — ${fd.get('name') || 'website'}`,
      };

      if (!validate(data)) {
        status.textContent = 'Please fix the highlighted fields.';
        status.classList.add('is-err');
        return;
      }

      submitBtn.classList.add('is-loading');
      submitBtn.disabled = true;

      // If the Formspree endpoint hasn't been configured, fall back to a
      // mailto: that pre-fills an email so the form still works on day one.
      if (FORMSPREE_ENDPOINT.includes('REPLACE_WITH_YOUR_ID')) {
        const body = [
          `Name: ${data.name}`,
          `Phone: ${data.phone}`,
          `Email: ${data.email || '—'}`,
          `Service address: ${data.address}`,
          `Services: ${data.services || '—'}`,
          `Timing: ${data.timing}`,
          `Measured area: ${data.measured_area || '—'}`,
          '',
          'Notes:',
          data.notes || '—',
        ].join('\n');
        const mailto =
          'mailto:hello@guzmanoutdoors.com' +
          '?subject=' + encodeURIComponent(data._subject) +
          '&body=' + encodeURIComponent(body);
        window.location.href = mailto;
        status.textContent = 'Opening your email app… if it didn\'t open, call (517) 555-0000.';
        status.classList.add('is-ok');
        submitBtn.classList.remove('is-loading');
        submitBtn.disabled = false;
        return;
      }

      try {
        const res = await fetch(FORMSPREE_ENDPOINT, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          form.reset();
          status.textContent = 'Got it — we\'ll be in touch shortly. Thank you!';
          status.classList.add('is-ok');
        } else {
          const j = await res.json().catch(() => ({}));
          status.textContent = j.error || 'Something went wrong. Please call (517) 555-0000.';
          status.classList.add('is-err');
        }
      } catch (err) {
        status.textContent = 'Network error — please try again or call (517) 555-0000.';
        status.classList.add('is-err');
      } finally {
        submitBtn.classList.remove('is-loading');
        submitBtn.disabled = false;
      }
    });

    // Clear individual field errors as user types
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', () => {
        const field = el.closest('.field');
        if (field && field.classList.contains('is-invalid')) {
          field.classList.remove('is-invalid');
          const err = form.querySelector(`.field-error[data-for="${el.id}"]`);
          if (err) err.textContent = '';
        }
      });
    });
  }
})();
