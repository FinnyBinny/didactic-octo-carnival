/* =============================================================
   Guzman Outdoors — site interactions
   - Footer year stamp
   - Scroll-detect for nav shadow lift
   - Mobile menu (hamburger morph + staggered overlay reveal)
   - Scroll-reveal IntersectionObserver
   - Quote form: client validation, honeypot, Formspree-ready
   ============================================================= */
(function () {
  'use strict';

  // -------- Footer year --------
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // -------- Nav scroll state --------
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (!nav) return;
    if (window.scrollY > 8) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // -------- Mobile menu (morph + overlay) --------
  const navToggle = document.getElementById('navToggle');
  const navOverlay = document.getElementById('navOverlay');

  function setMenu(open) {
    if (!nav || !navOverlay || !navToggle) return;
    nav.classList.toggle('is-open', open);
    navOverlay.classList.toggle('is-open', open);
    navOverlay.setAttribute('aria-hidden', String(!open));
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const isOpen = nav.classList.contains('is-open');
      setMenu(!isOpen);
    });
  }
  if (navOverlay) {
    navOverlay.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => setMenu(false));
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav && nav.classList.contains('is-open')) {
      setMenu(false);
    }
  });

  // -------- Scroll-reveal --------
  // Mark elements with data-reveal; they fade/blur in as they enter view.
  // We unobserve after first reveal to avoid re-triggering.
  const reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    // Fallback: reveal everything immediately
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  // -------- Quote form --------
  // To go live, replace this with your Formspree endpoint id:
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
    if (!form) return;
    form.querySelectorAll('.field.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
    form.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
    if (status) {
      status.textContent = '';
      status.classList.remove('is-ok', 'is-err');
    }
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
      if (fd.get('company')) return; // honeypot

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
        if (status) {
          status.textContent = 'Please fix the highlighted fields.';
          status.classList.add('is-err');
        }
        return;
      }

      submitBtn.classList.add('is-loading');
      submitBtn.disabled = true;

      // Fallback if Formspree endpoint hasn't been set yet
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
        if (status) {
          status.textContent = "Opening your email app… if it didn't, call (517) 555-0000.";
          status.classList.add('is-ok');
        }
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
          if (status) {
            status.textContent = "Got it — we'll be in touch shortly. Thank you!";
            status.classList.add('is-ok');
          }
        } else {
          const j = await res.json().catch(() => ({}));
          if (status) {
            status.textContent = j.error || 'Something went wrong. Please call (517) 555-0000.';
            status.classList.add('is-err');
          }
        }
      } catch (err) {
        if (status) {
          status.textContent = 'Network error — please try again or call (517) 555-0000.';
          status.classList.add('is-err');
        }
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
