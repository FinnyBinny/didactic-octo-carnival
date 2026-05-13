# Guzman Outdoors LLC — Website

Static marketing site for Guzman Outdoors LLC (Williamston, MI). One HTML page,
one stylesheet, two small JS files. No build step, no framework. Drop it on
Netlify, Cloudflare Pages, GitHub Pages, or any static host and it runs.

## Files

```
index.html         Page markup (nav, hero, services, calculator, gallery, form, footer)
css/styles.css     All styling
js/calculator.js   Acreage measuring tool (Leaflet + Geoman + Nominatim)
js/main.js         Mobile nav + quote-form submit handler
```

## What's on the page

1. **Hero** — headline, free-quote CTA, link to the measuring tool, trust strip
2. **Services** — landscaping, mulching, lawn care, tree service, general work
3. **Smart Acreage Tool** — interactive map (see below)
4. **Service Area** — Williamston, Webberville, Delhi Twp., Mason, Bath Twp.,
   Lansing Twp., plus surrounding
5. **Our Work** — gallery (placeholder photos until real shots are dropped in)
6. **About** — short story, contact card
7. **Free Quote form** — multi-field with optional pre-filled measured area
8. **Footer** — contact, services, hours, Facebook

## The Smart Acreage Tool

There is no free public API that auto-detects a property's lot boundary from an
address (county parcel data is paid / licensed). The tool does the next best
thing — and honestly more useful, since customers rarely want the *whole* lot
serviced:

1. Customer types their address. We geocode it with **OpenStreetMap Nominatim**
   (free, no key).
2. The map zooms to a satellite view of the property.
3. They click "Draw area" and trace the section of their yard they want
   serviced. Double-click finishes the polygon.
4. Every corner is draggable, so they can fine-tune. They can also undo the
   last point while drawing, remove a whole section with its trash icon, or
   add a second / third polygon (e.g. front yard + back yard).
5. Total square footage and acreage update live, and the result auto-fills
   into the quote form.

The area math is a proper geodesic (spherical-excess) calculation, so it stays
accurate regardless of latitude.

### Map tile source

Satellite imagery comes from Esri World Imagery. It's free for light /
non-commercial use. If traffic grows, swap it for a paid provider (Mapbox,
Stadia Maps) — change only the tile URL in `js/calculator.js`.

## Before going live — three things to swap

All three are searchable strings in the codebase:

1. **Phone number** — search for `(517) 555-0000` and `+15175550000` and
   replace everywhere (index.html and js/main.js).
2. **Email** — search for `hello@guzmanoutdoors.com` and replace.
3. **Form endpoint** — in `js/main.js`, replace
   `https://formspree.io/f/REPLACE_WITH_YOUR_ID` with a real
   [Formspree](https://formspree.io) form ID (free tier is fine). Until that's
   done, the form falls back to opening the customer's email app pre-filled
   with their request — it still works, just less seamless.

Optional: drop real project photos into `assets/` and update the `<img src>`
attributes in the gallery and hero. The current images are stock placeholders.

## Local preview

No build step. Just serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or use any static-file server.

## Deploying

- **Netlify / Cloudflare Pages / Vercel**: connect the repo, no build command,
  publish directory is the repo root.
- **GitHub Pages**: enable Pages on the branch, root folder.
- **Plain web host**: upload the four files (and the `assets/` folder if used)
  via FTP.

## Tech / licensing notes

- [Leaflet](https://leafletjs.com/) — BSD-2
- [Leaflet-Geoman Free](https://geoman.io/leaflet-geoman) — MIT (free version)
- [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) — please
  respect the usage policy (≤ 1 req/sec, attribution). Fine for a small-business
  contact form; if usage gets heavy, switch to a paid geocoder.
- Esri World Imagery tiles — see Esri's terms.
- Fonts: Bricolage Grotesque + Outfit (both Google Fonts, open-licensed).
