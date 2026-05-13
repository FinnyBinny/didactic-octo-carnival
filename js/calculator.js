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

  const PALETTE = [
    '#1f3d12', '#c8612e', '#d4a64a', '#2d5a1c', '#7a3b1a', '#4a6b2c'
  ];

  // ---------- Map setup ----------
  // Williamston, MI default view
  const DEFAULT_VIEW = [42.6889, -84.2839];
  const DEFAULT_ZOOM = 13;

  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  const map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true,
  }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);

  // Satellite tiles (Esri World Imagery — free for non-commercial light usage)
  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 21,
      attribution:
        'Imagery © Esri, Maxar, Earthstar Geographics · © OpenStreetMap',
    }
  ).addTo(map);

  // Light label overlay for street names
  L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 21, opacity: 0.85 }
  ).addTo(map);

  // ---------- Geoman config ----------
  map.pm.setGlobalOptions({
    snappable: true,
    allowSelfIntersection: false,
    finishOn: 'dblclick',
    templineStyle: { color: '#c8612e', weight: 2, dashArray: '4 4' },
    hintlineStyle: { color: '#c8612e', weight: 2, dashArray: '4 4' },
    pathOptions: {
      color: '#1f3d12',
      weight: 2,
      fillColor: '#1f3d12',
      fillOpacity: 0.28,
    },
  });
  // ---------- State ----------
  let addressMarker = null;
  const sections = []; // { id, layer, color, name, areaSqM }
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
    hint.textContent = msg;
    hint.classList.remove('is-error', 'is-success');
    if (kind === 'error') hint.classList.add('is-error');
    if (kind === 'ok') hint.classList.add('is-success');
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  // Geodesic polygon area using spherical excess (returns m²)
  // Accepts an array of [lat, lng] points.
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
        (toRad(p2[1] - p1[1])) *
        (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
    }
    area = (area * R * R) / 2;
    return Math.abs(area);
  }

  function latLngsFromLayer(layer) {
    let latlngs = layer.getLatLngs();
    // Polygons: array of rings — take the outer ring
    while (Array.isArray(latlngs) && Array.isArray(latlngs[0]) && latlngs[0].length !== undefined) {
      latlngs = latlngs[0];
    }
    if (!Array.isArray(latlngs)) return [];
    return latlngs.map((p) => [p.lat, p.lng]);
  }

  function sqMtoSqFt(m) { return m * 10.7639104167; }
  function sqMtoAcres(m) { return m / 4046.8564224; }

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

    areaSqFtEl.textContent = `${formatInt(sqft)} sq ft`;
    areaAcresEl.textContent = `${acres.toFixed(3)} ac`;
    sectionCountEl.textContent = String(sections.length);

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

    // Buttons
    const hasSections = sections.length > 0;
    addBtn.disabled = !hasSections;
    undoBtn.disabled = !map.pm.Draw.Polygon.enabled();
    clearBtn.disabled = !hasSections;
    sendBtn.disabled = !hasSections;

    // Update form area field if it exists
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
    const color = PALETTE[sections.length % PALETTE.length];
    layer.setStyle({
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.28,
    });

    // Enable editing immediately so corners are draggable
    if (layer.pm) {
      layer.pm.enable({ allowSelfIntersection: false, snappable: true });
    }

    const id = nextId++;
    sections.push({ id, layer, color, areaSqM: 0 });

    // Live update while user drags vertices
    layer.on('pm:edit pm:markerdragend pm:vertexremoved pm:vertexadded', render);

    render();
  }

  // ---------- Drawing ----------
  function startDrawing() {
    if (!addressMarker) {
      setHint('Locate your address first, then trace your yard.', 'error');
      addrInput.focus();
      return;
    }
    map.pm.enableDraw('Polygon', {
      snappable: true,
      finishOn: 'dblclick',
    });
    drawBtn.textContent = 'Click to drop points · double-click to finish';
    undoBtn.disabled = false;
  }

  function stopDrawingUi() {
    drawBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg> Draw area';
    undoBtn.disabled = true;
  }

  map.on('pm:create', (e) => {
    const layer = e.layer;
    addLayerAsSection(layer);
    stopDrawingUi();
  });

  map.on('pm:drawstart', () => { undoBtn.disabled = false; });
  map.on('pm:drawend', stopDrawingUi);

  drawBtn.addEventListener('click', startDrawing);
  addBtn.addEventListener('click', startDrawing);

  undoBtn.addEventListener('click', () => {
    // Geoman exposes the active drawer; remove last vertex
    const draw = map.pm.Draw.Polygon;
    if (draw && draw.enabled()) {
      // _removeLastVertex isn't public API but is stable; fallback: cancel.
      if (typeof draw._removeLastVertex === 'function') {
        draw._removeLastVertex();
      } else {
        map.pm.disableDraw('Polygon');
        stopDrawingUi();
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!sections.length) return;
    if (!confirm('Remove all drawn areas?')) return;
    sections.slice().forEach((s) => map.removeLayer(s.layer));
    sections.length = 0;
    render();
  });

  sendBtn.addEventListener('click', () => {
    // Scroll to quote form; form-area is already auto-filled
    const quote = document.getElementById('quote');
    if (quote) quote.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const notes = document.getElementById('f_notes');
      if (notes) notes.focus();
    }, 600);
  });

  // ---------- Geocoding ----------
  async function geocode(query) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=0&q=' +
      encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display: data[0].display_name,
    };
  }

  async function locateAddress() {
    const q = addrInput.value.trim();
    if (!q) {
      setHint('Type an address — street, city, state.', 'error');
      addrInput.focus();
      return;
    }
    setHint('Locating…');
    findBtn.disabled = true;

    try {
      const hit = await geocode(q);
      if (!hit) {
        setHint('Couldn\'t find that address. Try adding city + state.', 'error');
        return;
      }
      // Marker
      if (addressMarker) map.removeLayer(addressMarker);
      addressMarker = L.marker([hit.lat, hit.lng], {
        icon: L.divIcon({
          className: 'addr-marker',
          html:
            '<div style="width:18px;height:18px;border-radius:50%;background:#c8612e;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.35);"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        interactive: false,
      }).addTo(map);

      map.setView([hit.lat, hit.lng], 19, { animate: true });
      drawBtn.disabled = false;
      addBtn.disabled = false;
      setHint('Located. Now hit "Draw area" and click around your yard.', 'ok');

      // Also push into the quote form's address field if it's empty
      const fAddr = document.getElementById('f_address');
      if (fAddr && !fAddr.value) fAddr.value = q;
    } catch (err) {
      console.error(err);
      setHint('Lookup failed. Check your connection and try again.', 'error');
    } finally {
      findBtn.disabled = false;
    }
  }

  findBtn.addEventListener('click', locateAddress);
  addrInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      locateAddress();
    }
  });

  // Initial render
  render();
})();
