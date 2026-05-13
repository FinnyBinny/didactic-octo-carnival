/* =============================================================
   Smart acreage calculator
   - Geocodes an address via Nominatim (OpenStreetMap)
   - Centers a satellite map on the property
   - Lets user draw / edit polygons over their yard
   - Computes geodesic area (spherical excess) in sq ft + acres
   - Tracks each section so it can be removed individually
   ============================================================= */

(function () {
  'use strict';

  // Bail out gracefully if Leaflet didn't load (e.g. offline)
  if (typeof window === 'undefined') return;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (typeof L === 'undefined') {
    mapEl.innerHTML =
      '<div style="padding:24px;text-align:center;color:#a93717;font-size:14px;">' +
      'The map library failed to load. Please refresh, or call us at (517) 555-0000.' +
      '</div>';
    return;
  }

  const PALETTE = [
    '#d04a2c', '#1e6091', '#e0a629', '#2f5d3a', '#d63f6e', '#7a3b1a'
  ];

  // Williamston, MI default view
  const DEFAULT_VIEW = [42.6889, -84.2839];
  const DEFAULT_ZOOM = 13;

  const map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true,
  }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);

  // Satellite tiles (Esri World Imagery)
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 21,
      attribution:
        'Imagery © Esri, Maxar, Earthstar Geographics · © OpenStreetMap',
    }
  ).addTo(map);

  // Reference labels on top
  L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 21, opacity: 0.85 }
  ).addTo(map);

  // Geoman config (only if available)
  if (map.pm && map.pm.setGlobalOptions) {
    map.pm.setGlobalOptions({
      snappable: true,
      allowSelfIntersection: false,
      finishOn: 'dblclick',
      templineStyle: { color: '#d04a2c', weight: 2, dashArray: '4 4' },
      hintlineStyle: { color: '#d04a2c', weight: 2, dashArray: '4 4' },
      pathOptions: {
        color: '#d04a2c',
        weight: 2.5,
        fillColor: '#d04a2c',
        fillOpacity: 0.3,
      },
    });
  }

  // ---------- State ----------
  let addressMarker = null;
  const sections = []; // { id, layer, color, areaSqM }
  let nextId = 1;

  // ---------- DOM ----------
  const addrInput = document.getElementById('addressInput');
  const findBtn = document.getElementById('findAddressBtn');
  const hint = document.getElementById('addressHint');

  const drawBtn = document.getElementById('drawBtn');
  const addBtn = document.getElementById('addBtn');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');

  const areaSqFtEl = document.getElementById('areaSqFt');
  const areaAcresEl = document.getElementById('areaAcres');
  const sectionCountEl = document.getElementById('sectionCount');
  const sectionListEl = document.getElementById('sectionList');
  const sendBtn = document.getElementById('sendToQuote');

  // ---------- Utilities ----------
  function setHint(msg, kind) {
    if (!hint) return;
    hint.textContent = msg;
    hint.classList.remove('is-error', 'is-success');
    if (kind === 'error') hint.classList.add('is-error');
    if (kind === 'ok') hint.classList.add('is-success');
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  // Geodesic polygon area using spherical excess (returns m²)
  function geodesicAreaSqM(latlngs) {
    if (!latlngs || latlngs.length < 3) return 0;
    const R = 6378137; // WGS84 equatorial radius (m)
    const toRad = (d) => (d * Math.PI) / 180;
    let area = 0;
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % n];
      area +=
        toRad(p2[1] - p1[1]) *
        (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
    }
    area = (area * R * R) / 2;
    return Math.abs(area);
  }

  function latLngsFromLayer(layer) {
    let latlngs = layer.getLatLngs();
    while (Array.isArray(latlngs) && latlngs.length && Array.isArray(latlngs[0])) {
      latlngs = latlngs[0];
    }
    if (!Array.isArray(latlngs)) return [];
    return latlngs.map((p) => [p.lat, p.lng]);
  }

  function sqMtoSqFt(m) { return m * 10.7639104167; }
  function sqMtoAcres(m) { return m / 4046.8564224; }

  function isDrawing() {
    try {
      return !!(map.pm && map.pm.Draw && map.pm.Draw.Polygon && map.pm.Draw.Polygon.enabled());
    } catch (e) { return false; }
  }

  // ---------- Render ----------
  function recomputeAll() {
    let total = 0;
    sections.forEach((s) => {
      const pts = latLngsFromLayer(s.layer);
      s.areaSqM = geodesicAreaSqM(pts);
      total += s.areaSqM;
    });
    return total;
  }

  function render() {
    const total = recomputeAll();
    const sqft = sqMtoSqFt(total);
    const acres = sqMtoAcres(total);

    if (areaSqFtEl) areaSqFtEl.textContent = `${formatInt(sqft)} sq ft`;
    if (areaAcresEl) areaAcresEl.textContent = `${acres.toFixed(3)} ac`;
    if (sectionCountEl) sectionCountEl.textContent = String(sections.length);

    if (sectionListEl) {
      sectionListEl.innerHTML = '';
      sections.forEach((s, idx) => {
        const pill = document.createElement('div');
        pill.className = 'section-pill';

        const color = document.createElement('span');
        color.className = 'pill-color';
        color.style.background = s.color;

        const name = document.createElement('span');
        name.className = 'pill-name';
        name.textContent = `Area ${idx + 1}`;

        const area = document.createElement('span');
        area.className = 'pill-area';
        area.textContent = `${formatInt(sqMtoSqFt(s.areaSqM))} sf · ${sqMtoAcres(s.areaSqM).toFixed(3)} ac`;

        const remove = document.createElement('button');
        remove.className = 'pill-remove';
        remove.type = 'button';
        remove.title = 'Remove this area';
        remove.setAttribute('aria-label', `Remove area ${idx + 1}`);
        remove.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
        remove.addEventListener('click', () => removeSection(s.id));

        pill.append(color, name, area, remove);
        sectionListEl.appendChild(pill);
      });
    }

    const hasSections = sections.length > 0;
    if (addBtn) addBtn.disabled = !hasSections;
    if (undoBtn) undoBtn.disabled = !isDrawing();
    if (clearBtn) clearBtn.disabled = !hasSections;
    if (sendBtn) sendBtn.disabled = !hasSections;

    const areaField = document.getElementById('f_area');
    if (areaField) {
      if (hasSections) {
        areaField.value = `${formatInt(sqft)} sq ft · ${acres.toFixed(3)} ac · ${sections.length} section${sections.length > 1 ? 's' : ''}`;
      } else {
        areaField.value = '';
      }
    }
  }

  function removeSection(id) {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    map.removeLayer(sections[idx].layer);
    sections.splice(idx, 1);
    render();
  }

  function addLayerAsSection(layer) {
    const color = PALETTE[(sections.length) % PALETTE.length];
    if (layer.setStyle) {
      layer.setStyle({
        color,
        weight: 2.5,
        fillColor: color,
        fillOpacity: 0.3,
      });
    }
    if (layer.pm && typeof layer.pm.enable === 'function') {
      try {
        layer.pm.enable({ allowSelfIntersection: false, snappable: true });
      } catch (e) { /* ignore */ }
    }

    const id = nextId++;
    sections.push({ id, layer, color, areaSqM: 0 });

    layer.on('pm:edit pm:markerdragend pm:vertexremoved pm:vertexadded', render);

    render();
  }

  // ---------- Drawing ----------
  function startDrawing() {
    if (!addressMarker) {
      setHint('Type your address and hit "Locate" first.', 'error');
      if (addrInput) addrInput.focus();
      return;
    }
    if (!map.pm) {
      setHint('Drawing tools failed to load. Please refresh.', 'error');
      return;
    }
    map.pm.enableDraw('Polygon', { snappable: true, finishOn: 'dblclick' });
    drawBtn.textContent = 'Click to drop points · double-click to finish';
    if (undoBtn) undoBtn.disabled = false;
  }

  function resetDrawBtnUi() {
    if (!drawBtn) return;
    drawBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg> Draw area';
    if (undoBtn) undoBtn.disabled = true;
  }

  map.on('pm:create', (e) => {
    addLayerAsSection(e.layer);
    resetDrawBtnUi();
  });
  map.on('pm:drawstart', () => { if (undoBtn) undoBtn.disabled = false; });
  map.on('pm:drawend', resetDrawBtnUi);

  if (drawBtn) drawBtn.addEventListener('click', startDrawing);
  if (addBtn) addBtn.addEventListener('click', startDrawing);

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      const draw = map.pm && map.pm.Draw && map.pm.Draw.Polygon;
      if (draw && draw.enabled()) {
        if (typeof draw._removeLastVertex === 'function') {
          draw._removeLastVertex();
        } else {
          map.pm.disableDraw('Polygon');
          resetDrawBtnUi();
        }
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!sections.length) return;
      if (!confirm('Remove all drawn areas?')) return;
      sections.slice().forEach((s) => map.removeLayer(s.layer));
      sections.length = 0;
      render();
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const quote = document.getElementById('quote');
      if (quote) quote.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        const notes = document.getElementById('f_notes');
        if (notes) notes.focus();
      }, 600);
    });
  }

  // ---------- Geocoding ----------
  async function geocode(query) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
      encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Geocoding failed (' + res.status + ')');
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display: data[0].display_name,
    };
  }

  async function locateAddress() {
    if (!addrInput) return;
    const q = addrInput.value.trim();
    if (!q) {
      setHint('Type an address — street, city, state.', 'error');
      addrInput.focus();
      return;
    }
    setHint('Locating…');
    if (findBtn) findBtn.disabled = true;

    try {
      const hit = await geocode(q);
      if (!hit) {
        setHint("Couldn't find that address. Try adding city + state.", 'error');
        return;
      }
      if (addressMarker) map.removeLayer(addressMarker);
      addressMarker = L.marker([hit.lat, hit.lng], {
        icon: L.divIcon({
          className: 'addr-marker',
          html:
            '<div style="width:20px;height:20px;border-radius:50%;background:#d04a2c;border:3px solid #fdf6e9;box-shadow:0 4px 14px rgba(0,0,0,0.4);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        interactive: false,
      }).addTo(map);

      map.setView([hit.lat, hit.lng], 19, { animate: true });
      setTimeout(() => map.invalidateSize(), 300);

      if (drawBtn) drawBtn.disabled = false;
      setHint('Located! Hit "Draw area" and click around your yard.', 'ok');

      const fAddr = document.getElementById('f_address');
      if (fAddr && !fAddr.value) fAddr.value = q;
    } catch (err) {
      console.error(err);
      setHint('Lookup failed. Check your connection and try again.', 'error');
    } finally {
      if (findBtn) findBtn.disabled = false;
    }
  }

  if (findBtn) findBtn.addEventListener('click', locateAddress);
  if (addrInput) {
    addrInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        locateAddress();
      }
    });
  }

  // ---------- Sizing fixes ----------
  // Leaflet needs its container to be visible & laid out before it sizes
  // tiles correctly. We invalidate on: load, resize, and first-time scroll
  // into view. This is the single most common reason a Leaflet map "looks
  // broken" — fixed here defensively.
  function invalidate() {
    try { map.invalidateSize(); } catch (e) {}
  }
  window.addEventListener('load', () => setTimeout(invalidate, 50));
  window.addEventListener('resize', invalidate);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setTimeout(invalidate, 100); });
    }, { threshold: 0.1 });
    io.observe(mapEl);
  } else {
    setTimeout(invalidate, 400);
  }

  // Initial render
  render();
})();
