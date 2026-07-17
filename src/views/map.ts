import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadGeo } from '../data';
import { escapeHtml, formatMoney, formatNumber } from '../format';
import { gloss } from '../glossary';
import { getMetric, makeScale, METRICS, NO_DATA_COLOUR } from '../metrics';
import type { Dataset } from '../types';
import type { ViewContext } from './types';

let geoCache: GeoJSON.FeatureCollection | null = null;

/**
 * Leaflet choropleth over real ABS postal-area polygons.
 * Adapted from patterns/leafletMap.ts — basemap, hover tooltips on every
 * polygon, attribution, zero-size defence.
 */
export async function renderMap(root: HTMLElement, data: Dataset, ctx: ViewContext): Promise<void> {
  const metricKey = ctx.getState('mapMetric', 'med');
  const metric = getMetric(metricKey);

  root.innerHTML = `
    <div class="view-head">
      <h2>Where the money is</h2>
      <p>
        Every Australian postcode, shaded by ${escapeHtml(metric.label.toLowerCase())}.
        ${escapeHtml(metric.blurb)} Hover any area for its figures; click to open it in full.
      </p>
    </div>
    <div class="view-controls">
      <label class="control">Shade by
        <select id="map-metric">
          ${METRICS.map(
            (m) => `<option value="${m.key}" ${m.key === metric.key ? 'selected' : ''}>${m.label}</option>`,
          ).join('')}
        </select>
      </label>
      <span style="font-size:var(--font-size-sm);color:var(--text-tertiary)">
        Colours use ${gloss('postcode', 'quantiles')} — each shade holds the same number of postcodes.
      </span>
    </div>
    <div class="map-canvas-wrap">
      <div class="map-canvas" id="map-canvas"></div>
    </div>
    <div class="legend" id="map-legend"></div>
  `;

  root.querySelector('#map-metric')?.addEventListener('change', (e) => {
    ctx.setState('mapMetric', (e.target as HTMLSelectElement).value);
    void renderMap(root, data, ctx);
  });

  const canvas = root.querySelector('#map-canvas') as HTMLElement;

  try {
    if (!geoCache) geoCache = await loadGeo(ctx.signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    canvas.innerHTML = `<div class="error-state">Could not load map boundaries. <button class="btn" id="map-retry">Retry</button></div>`;
    canvas.querySelector('#map-retry')?.addEventListener('click', () => void renderMap(root, data, ctx));
    return;
  }

  const values = data.postcodes.map((p) => metric.get(p)).filter((v): v is number => v !== null);
  const scale = makeScale(values, metric);

  const map = L.map(canvas, {
    minZoom: 3,
    maxZoom: 12,
    zoomControl: true,
    scrollWheelZoom: false, // don't hijack page scroll
  });
  map.attributionControl.setPrefix(false);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 12,
  }).addTo(map);

  const layer = L.geoJSON(geoCache, {
    attribution: 'Boundaries: ABS ASGS 2021 · Data: ATO',
    style: (f) => {
      const p = data.byPc.get((f?.properties as { pc: string }).pc);
      return {
        fillColor: p ? scale.of(metric.get(p)) : NO_DATA_COLOUR,
        fillOpacity: 0.85,
        color: '#ffffff',
        weight: 0.4,
      };
    },
    onEachFeature: (f, lyr) => {
      const pc = (f.properties as { pc: string }).pc;
      const p = data.byPc.get(pc);
      if (!p) return;
      lyr.bindTooltip(
        `<strong>${escapeHtml(p.name)}</strong> ${escapeHtml(p.pc)}<br>
         <span class="tip-metric">${metric.short}: ${metric.format(metric.get(p))}</span><br>
         <span style="color:var(--text-tertiary)">Median ${formatMoney(p.med)} · Average ${formatMoney(p.avg)}<br>
         ${formatNumber(p.n)} taxpayers</span>`,
        { sticky: true, className: 'map-tip' },
      );
      lyr.on({
        mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#0d1b2a' }),
        mouseout: () => layer.resetStyle(lyr as L.Path),
        click: () => ctx.openPostcode(pc),
      });
    },
  }).addTo(map);

  // Zero-size defence: Leaflet mis-renders in a container that hasn't laid out.
  const bounds = layer.getBounds();
  const fit = () => {
    map.invalidateSize();
    if (bounds.isValid() && canvas.clientHeight > 50) map.fitBounds(bounds, { padding: [10, 10] });
  };
  const ro = new ResizeObserver(() => {
    if (canvas.clientHeight > 50) {
      fit();
      ro.disconnect();
    }
  });
  ro.observe(canvas);
  setTimeout(fit, 400);
  ctx.onTeardown(() => {
    ro.disconnect();
    map.remove();
  });

  const legend = root.querySelector('#map-legend') as HTMLElement;
  legend.innerHTML = `
    <span>${escapeHtml(metric.short)}:</span>
    <span class="legend-ramp">
      ${scale.colours
        .map((c, i) => {
          const lo = i === 0 ? Math.min(...values) : scale.breaks[i - 1];
          const hi = i === scale.colours.length - 1 ? Math.max(...values) : scale.breaks[i];
          return `<span class="legend-swatch" style="background:${c}"
            data-tip="${metric.format(lo)} – ${metric.format(hi)}"></span>`;
        })
        .join('')}
    </span>
    <span style="font-family:var(--font-mono)">${metric.format(Math.min(...values))}</span>
    <span style="color:var(--text-muted)">→</span>
    <span style="font-family:var(--font-mono)">${metric.format(Math.max(...values))}</span>
    <span class="legend-item" style="margin-left:auto">
      <span class="legend-swatch" style="background:${NO_DATA_COLOUR}"></span>No data
    </span>
  `;
}
