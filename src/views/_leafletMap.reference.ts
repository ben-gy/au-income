// CANONICAL Leaflet map pattern. Copy-adapt into src/ — do not re-roll.
// Provenance: nsw-pokies src/map.ts (choropleth) + au-gov src/views/map.ts (markers).
//
// Non-negotiables baked in here:
//  1. Boundaries come from a real GeoJSON file (see patterns/geo/) — NEVER
//     hand-author coordinates in any format.
//  2. Hover tooltip on every polygon and marker (bindTooltip — Leaflet-native
//     tooltips track panes/zoom correctly; do not use the [data-tip] util here).
//  3. The zero-size defence: Leaflet mis-renders when created in a container
//     that hasn't finished layout. Always invalidateSize + re-fit after mount.
//  4. Attribution for boundary + tile sources.
import L from 'leaflet'; // package.json: "leaflet": "^1.9.4" + "@types/leaflet" — npm, never CDN JS

export async function renderMap(container: HTMLElement, onSelect: (id: string) => void): Promise<void> {
  container.innerHTML = '<div class="map-canvas"></div>'; // CSS: fixed height (e.g. 640px), border-radius, overflow hidden
  const canvas = container.querySelector('.map-canvas') as HTMLElement;

  const map = L.map(canvas, {
    minZoom: 3,
    maxZoom: 12,
    zoomControl: true,
    scrollWheelZoom: false, // don't hijack page scroll; zoom buttons + pinch still work
  });
  map.attributionControl.setPrefix(false);

  // Light basemap for geographic context. Omit only for flat state-level
  // choropleths where the design calls for a paper style.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 12,
  }).addTo(map);

  // Real boundaries — reuse patterns/geo/au-states.geojson (ABS-derived) or
  // download + mapshaper-simplify from an authoritative source (geo/README.md).
  const geo = await fetch('data/boundaries.geojson').then((r) => {
    if (!r.ok) throw new Error('Could not load boundaries');
    return r.json();
  });

  const layer = L.geoJSON(geo, {
    attribution: 'Boundaries: ABS ASGS (CC BY 4.0)',
    style: (f: any) => ({
      fillColor: colourFor(f.properties), // choropleth scale or flat fill
      fillOpacity: 0.8,
      color: '#ffffff',
      weight: 0.6,
    }),
    onEachFeature: (f: any, lyr: any) => {
      lyr.bindTooltip(tooltipHtmlFor(f.properties), { sticky: true, className: 'map-tip' });
      lyr.on({
        mouseover: () => lyr.setStyle({ weight: 2, color: '#0f172a' }),
        mouseout: () => layer.resetStyle(lyr),
        click: () => onSelect(f.properties.code),
      });
    },
  }).addTo(map);

  // Point markers (if the data is point-based): L.circleMarker sized by count,
  // with BOTH a hover tooltip and a click popup:
  //   marker.bindTooltip(`${name} — ${count} entities`, { direction: 'top', opacity: 0.95 });
  //   marker.bindPopup(detailHtml);
  //   marker.on('mouseover', () => marker.setStyle({ weight: 2.5 }));
  //   marker.on('mouseout', () => marker.setStyle({ weight: 1 }));

  // Zero-size defence: fit once the container has real height, plus a fallback.
  const bounds = layer.getBounds();
  const fit = () => {
    map.invalidateSize();
    if (bounds.isValid() && canvas.clientHeight > 50) map.fitBounds(bounds, { padding: [12, 12] });
  };
  const ro = new ResizeObserver(() => { if (canvas.clientHeight > 50) { fit(); ro.disconnect(); } });
  ro.observe(canvas);
  setTimeout(fit, 400);
}

declare function colourFor(props: any): string;
declare function tooltipHtmlFor(props: any): string;
