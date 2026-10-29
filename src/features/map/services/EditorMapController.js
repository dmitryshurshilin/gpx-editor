import L from "leaflet";
import { PointLayer } from "./PointLayer.js";
import { BasemapLayers } from "./BasemapLayers.js";
import { createPointInteractions } from "./PointInteractions.js";
import { MapScreenshot } from "./MapScreenshot.js";

// Leaflet owns its container. React owns the controls and observes committed edits.
export function createEditorMapController(container, editor) {
  const state = editor.model;
  let interactions = null,
    resizeFrame = 0,
    viewFrame = 0;
  const abort = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
      ...options,
      signal: abort.signal,
    });
  const map = L.map(container, { preferCanvas: true, boxZoom: false }).setView(
    [53.22, 50.13],
    11,
  );
  const layers = L.layerGroup().addTo(map);
  let routeLines = [];
  const pointLayer = new PointLayer(
    map,
    container,
    state,
    () => interactions?.activeIndex,
  );
  const projectPoints = () => pointLayer.project(),
    paintPoints = () => pointLayer.paint();
  const message = (text, error = false) => editor.setStatus(text, error);
  const basemaps = new BasemapLayers(map, L, (name) =>
    message(
      name === "satellite"
        ? "Не удалось загрузить спутниковые снимки. Проверьте соединение или переключитесь на схему."
        : "Не удалось загрузить схему. Проверьте соединение или переключитесь на спутник.",
      true,
    ),
  );
  basemaps.select(editor.basemap);
  const screenshot = new MapScreenshot(map, container, {
    beforeExport: () => {
      interactions.reset();
      projectPoints();
      paintPoints();
    },
    notify: message,
    onStateChange: (value) => editor.setCapture(value),
    onFeedback: (value) => editor.setCaptureFeedback(value),
  });
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
  const observer = new ResizeObserver(() => {
    if (!resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        map.invalidateSize({ animate: false });
      });
  });
  observer.observe(container);
  function fit() {
    screenshot.cancel();
    if (state.bounds)
      map.fitBounds(state.bounds, { padding: [40, 40], maxZoom: 16 });
  }
  function insertPoint(group, latlng) {
    if (
      screenshot?.active ||
      interactions.active ||
      editor.mode === "select" ||
      group.length < 2
    )
      return;
    const click = map.latLngToLayerPoint(latlng);
    let best = null;
    let a = map.latLngToLayerPoint([group[0].lat, group[0].lng]);
    for (let i = 1; i < group.length; i++) {
      const b = map.latLngToLayerPoint([group[i].lat, group[i].lng]);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((click.x - a.x) * dx + (click.y - a.y) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        );
      const projected = L.point(a.x + t * dx, a.y + t * dy),
        distance = (click.x - projected.x) ** 2 + (click.y - projected.y) ** 2;
      if (!best || distance < best.distance) best = { i, projected, distance };
      a = b;
    }
    const next = group[best.i].node,
      position = map.layerPointToLatLng(best.projected);
    editor.insert(next, position);
  }
  function refresh() {
    if (layers) {
      layers.clearLayers();
      routeLines = state.groups.map((group) =>
        L.polyline(
          group.map((p) => [p.lat, p.lng]),
          {
            color: "#4c7954",
            weight: 4,
            opacity: 0.85,
            bubblingMouseEvents: false,
          },
        )
          .addTo(layers)
          .on("click", (e) => insertPoint(group, e.latlng)),
      );
      projectPoints();
      paintPoints();
    }
  }
  listen(document, "keydown", (e) => {
    if (e.key === "Escape") {
      if (document.querySelector("dialog[open]")) return;
      if (screenshot?.active) {
        screenshot.cancel();
        return;
      }
      if (editor.fullscreen) {
        editor.setFullscreen(false);
        return;
      }
      interactions.reset();
      editor.clearSelection();
    }
  });

  function syncMode() {
    const mode = editor.mode;
    container.classList.toggle("selecting", mode === "select");
    if (mode === "select") {
      map.dragging.disable();
      map.doubleClickZoom.disable();
    } else {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    }
  }
  const unsubscribe = editor.subscribeScene(({ type }) => {
    switch (type) {
      case "prepare":
        screenshot.cancel();
        interactions.reset();
        break;
      case "load":
        refresh();
        fit();
        break;
      case "geometry":
        interactions.reset();
        refresh();
        break;
      case "move":
        projectPoints();
        paintPoints();
        break;
      case "selection":
        paintPoints();
        break;
      case "mode":
        syncMode();
        break;
      case "basemap":
        basemaps.select(editor.basemap);
        break;
      case "fit":
        interactions.reset();
        fit();
        break;
      case "capture":
        if (screenshot.active) screenshot.cancel();
        else screenshot.start();
        break;
      case "fullscreen": {
        const center = map.getCenter(),
          zoom = map.getZoom();
        cancelAnimationFrame(viewFrame);
        viewFrame = requestAnimationFrame(() => {
          map.invalidateSize({ pan: false });
          map.setView(center, zoom, { animate: false });
          pointLayer.schedule();
        });
        break;
      }
    }
  });
  interactions = createPointInteractions({
    map,
    leaflet: L,
    container,
    editor,
    pointLayer,
    getRouteLines: () => routeLines,
    isCapturing: () => screenshot.active,
  });
  syncMode();
  refresh();
  if (state.doc) fit();
  editor.setMapReady(true);
  return {
    destroy() {
      unsubscribe();
      abort.abort();
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(viewFrame);
      screenshot.destroy();
      interactions.destroy();
      pointLayer.destroy();
      map.remove();
      editor.setMapReady(false);
    },
  };
}
