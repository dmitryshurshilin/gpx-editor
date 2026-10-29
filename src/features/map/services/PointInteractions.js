import { PointerGesture } from "./PointerGesture.js";
import { RouteEditPreview } from "./RouteEditPreview.js";

// Pointer gestures mutate only the live preview until the user releases it.
export function createPointInteractions({
  map,
  leaflet,
  container,
  editor,
  pointLayer,
  getRouteLines,
  isCapturing,
}) {
  const state = editor.model;
  let activeDrag = null,
    lastPointClick = null,
    suppressPointClickUntil = 0;
  const DOUBLE_CLICK_MS = 400,
    CLICK_SUPPRESSION_MS = 100,
    DRAG_START_PIXELS = 3;
  const abort = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
      ...options,
      signal: abort.signal,
    });
  const projectPoints = () => pointLayer.project(),
    paintPoints = () => pointLayer.paint();
  const pointAt = (x, y) => pointLayer.pointAt(x, y);
  const message = (text, error = false) => editor.setStatus(text, error);
  const deletePoints = (indices) => editor.remove(indices);
  let start = null,
    box = null,
    boxFrame = 0,
    boxEnd = null;
  const selectionGesture = new PointerGesture(container);
  let dragFrame = 0;
  function renderDrag() {
    dragFrame = 0;
    if (!activeDrag) return;
    const d = activeDrag,
      pt = map.latLngToContainerPoint([d.p.lat, d.p.lng]);
    d.handle.style.transform =
      "translate(" + (pt.x - 6) + "px," + (pt.y - 6) + "px)";
    d.editPreview.update();
  }
  function cancelDrag(cancel = false) {
    if (!activeDrag) return;
    const d = activeDrag;
    activeDrag = null;
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
    if (container.hasPointerCapture(d.pointer))
      container.releasePointerCapture(d.pointer);
    d.handle.remove();
    if (editor.mode !== "select") map.dragging.enable();
    if (cancel || !d.moved) {
      d.p.lat = d.lat;
      d.p.lng = d.lng;
      state.totalDistance = d.total;
      d.editPreview.finish();
      projectPoints();
      paintPoints();

      return;
    }
    editor.commitMove(d.p, d.originalLat, d.originalLon);
    lastPointClick = null;
    d.editPreview.finish();
    projectPoints();
    paintPoints();

    message("Координаты точки обновлены в GPX.");
  }
  listen(
    container,
    "pointerdown",
    (e) => {
      if (
        isCapturing() ||
        activeDrag ||
        start ||
        editor.mode === "select" ||
        !map ||
        !state.doc ||
        e.button !== 0 ||
        e.target.closest(".leaflet-control")
      )
        return;
      const rect = container.getBoundingClientRect(),
        x = e.clientX - rect.left,
        y = e.clientY - rect.top,
        index = pointAt(x, y);
      if (index === null) return;
      editor.cancelAutocorrectPreview?.(true);
      e.preventDefault();
      e.stopImmediatePropagation();
      const p = state.points[index],
        handle = document.createElement("div");
      handle.className = "track-point drag-handle";
      container.append(handle);
      activeDrag = {
        rect,
        index,
        p,
        pointer: e.pointerId,
        startX: x,
        startY: y,
        lat: p.lat,
        lng: p.lng,
        total: state.totalDistance,
        originalLat: p.node.getAttribute("lat"),
        originalLon: p.node.getAttribute("lon"),
        moved: false,
        handle,
        editPreview: new RouteEditPreview(
          map,
          leaflet,
          p.group ? getRouteLines()[state.groups.indexOf(p.group)] : null,
          p.group,
          p.groupIndex,
        ),
      };
      map.dragging.disable();
      container.setPointerCapture(e.pointerId);
      paintPoints();
      renderDrag();
    },
    { capture: true },
  );
  listen(
    container,
    "pointermove",
    (e) => {
      if (!activeDrag || e.pointerId !== activeDrag.pointer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const d = activeDrag,
        rect = d.rect,
        x = e.clientX - rect.left,
        y = e.clientY - rect.top;
      if (
        !d.moved &&
        Math.hypot(x - d.startX, y - d.startY) < DRAG_START_PIXELS
      )
        return;
      d.moved = true;
      const position = map.containerPointToLatLng([x, y]);
      state.previewMove(d.p, position);
      if (!dragFrame) dragFrame = requestAnimationFrame(renderDrag);
    },
    { capture: true },
  );
  listen(
    container,
    "pointerup",
    (e) => {
      if (!activeDrag || e.pointerId !== activeDrag.pointer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const { index, moved } = activeDrag;
      cancelDrag();
      suppressPointClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
      if (moved || editor.fullscreen) {
        lastPointClick = null;
        return;
      }
      const node = state.points[index].node,
        now = performance.now();
      if (
        lastPointClick?.node === node &&
        now - lastPointClick.time <= DOUBLE_CLICK_MS
      ) {
        lastPointClick = null;
        deletePoints(new Set([index]));
        message(
          "Точка удалена. Соседние точки соединены. Изменение можно отменить.",
        );
      } else {
        lastPointClick = { node, time: now };
        editor.togglePoint(index);
      }
    },
    { capture: true },
  );
  listen(
    container,
    "click",
    (e) => {
      if (performance.now() < suppressPointClickUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  listen(
    container,
    "dblclick",
    (e) => {
      if (e.target.closest(".leaflet-control")) return;
      if (performance.now() < suppressPointClickUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  listen(container, "pointercancel", () => {
    lastPointClick = null;
    cancelDrag(true);
  });
  listen(
    container,
    "pointerdown",
    (e) => {
      if (
        isCapturing() ||
        activeDrag ||
        start ||
        editor.mode !== "select" ||
        !map ||
        !state.doc ||
        e.button !== 0 ||
        e.target.closest(".leaflet-control")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const rect = container.getBoundingClientRect();
      start = { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
      box = document.createElement("div");
      box.className = "selection-box";
      container.append(box);
      selectionGesture.start(e, {
        onMove: moveBox,
        onEnd: finishBox,
        onCancel: clearBox,
      });
    },
    { capture: true },
  );
  function renderBox() {
    boxFrame = 0;
    if (!start || !boxEnd) return;
    const x = boxEnd.x,
      y = boxEnd.y;
    Object.assign(box.style, {
      left: Math.min(start.x, x) + "px",
      top: Math.min(start.y, y) + "px",
      width: Math.abs(x - start.x) + "px",
      height: Math.abs(y - start.y) + "px",
    });
  }
  function moveBox(e) {
    const rect = start.rect;
    boxEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!boxFrame) boxFrame = requestAnimationFrame(renderBox);
  }
  function clearBox() {
    if (boxFrame) cancelAnimationFrame(boxFrame);
    boxFrame = 0;
    boxEnd = null;
    box?.remove();
    box = null;
    start = null;
  }
  function cancelBox() {
    selectionGesture.cancel();
    clearBox();
  }
  function finishBox(e) {
    if (!start) return;
    const rect = start.rect,
      end = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const indices = [];
    if (Math.abs(start.x - end.x) > 3 || Math.abs(start.y - end.y) > 3) {
      const minX = Math.min(start.x, end.x),
        maxX = Math.max(start.x, end.x),
        minY = Math.min(start.y, end.y),
        maxY = Math.max(start.y, end.y);
      projectPoints();
      for (const pt of pointLayer.projected) {
        if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY)
          indices.push(pt.i);
      }
    }
    clearBox();
    editor.selectIndices(indices);
  }
  listen(container, "lostpointercapture", (e) => {
    if (activeDrag?.pointer === e.pointerId) cancelDrag(true);
  });

  function reset() {
    cancelDrag(true);
    cancelBox();
    lastPointClick = null;
  }
  return {
    get activeIndex() {
      return activeDrag?.index;
    },
    get active() {
      return !!activeDrag || !!start;
    },
    reset,
    cancelDrag,
    cancelBox,
    destroy() {
      abort.abort();
      reset();
    },
  };
}
