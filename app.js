(() => {
  "use strict";
  // Controller: DOM events, map interactions and rendering orchestration.
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, document.getElementById(id));
    return elements.get(id);
  };
  const {
    TrackModel,
    parseGPX,
    PointLayer,
    BasemapLayers,
    RouteEditPreview,
    MapScreenshot,
    distanceBetween: haversine,
  } = GPXEditor;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const JUMP_THRESHOLD_METERS = 500;
  const DOUBLE_CLICK_MS = 400;
  const CLICK_SUPPRESSION_MS = 100;
  const DRAG_START_PIXELS = 3;
  const state = new TrackModel();
  let mode = "pan",
    activeDrag = null,
    fullscreenActive = false;
  let lastPointClick = null,
    suppressPointClickUntil = 0,
    loadRequest = 0;
  const map =
    typeof L !== "undefined"
      ? L.map("map", { preferCanvas: true, boxZoom: false }).setView(
          [53.22, 50.13],
          11,
        )
      : null;
  const layers = map ? L.layerGroup().addTo(map) : null;
  let routeLines = [];
  const countFormat = new Intl.NumberFormat("ru-RU");
  const distanceFormat = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  });
  const pointLayer = map
    ? new PointLayer(map, $("map"), state, () => activeDrag?.index)
    : null;
  const schedulePaint = () => pointLayer?.schedule();
  const projectPoints = () => pointLayer?.project();
  const paintPoints = () => pointLayer?.paint();
  const pointAt = (x, y) => pointLayer?.pointAt(x, y) ?? null;
  const serialize = () => state.serialize();
  let screenshot = null;
  let resizeFrame = 0;
  const resizeObserver = map
    ? new ResizeObserver(() => {
        if (!resizeFrame)
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            map.invalidateSize({ animate: false });
          });
      })
    : null;
  resizeObserver?.observe($("map"));
  if (map) {
    const basemaps = new BasemapLayers(map, L, (name) => {
      message(
        name === "satellite"
          ? "Не удалось загрузить спутниковые снимки. Проверьте соединение или переключитесь на схему."
          : "Не удалось загрузить схему. Проверьте соединение или переключитесь на спутник.",
        true,
      );
    });
    const buttons = {
      street: $("basemap-street"),
      satellite: $("basemap-satellite"),
    };
    for (const [name, button] of Object.entries(buttons)) {
      button.disabled = false;
      button.onclick = () => {
        screenshot?.cancel();
        cancelDrag(true);
        cancelBox();
        if (!basemaps.select(name)) return;
        for (const [key, control] of Object.entries(buttons)) {
          control.classList.toggle("active", key === name);
          control.setAttribute("aria-pressed", String(key === name));
        }
      };
    }
    screenshot = new MapScreenshot(
      map,
      $("map"),
      $("map-screenshot"),
      $("capture-status"),
      () => {
        cancelDrag(true);
        cancelBox();
        lastPointClick = null;
        projectPoints();
        paintPoints();
      },
      message,
    );
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
  } else
    message(
      "Не удалось загрузить карту. Проверьте подключение к интернету.",
      true,
    );
  function message(text, error = false) {
    $("message").textContent = text;
    $("message").classList.toggle("error", error);
  }
  function load(text, name, size) {
    const parsed = parseGPX(text);
    screenshot?.cancel();
    cancelDrag(true);
    cancelBox();
    lastPointClick = null;
    state.load(parsed, name);
    $("filename").textContent = name;
    $("filesize").textContent = (size / 1024).toFixed(1) + " КБ · GPX";
    $("file-info").hidden = false;
    refresh();
    fit();
    message("Трек загружен. Включите выделение, чтобы убрать лишние точки.");
  }
  async function read(file) {
    if (!file) return;
    const request = ++loadRequest;
    if (file.size > MAX_FILE_BYTES) {
      message("Файл слишком большой. Максимальный размер — 20 МБ.", true);
      return;
    }
    try {
      const text = await file.text();
      if (request !== loadRequest) return;
      load(text, file.name, file.size);
    } catch (error) {
      if (request === loadRequest)
        message(error.message || "Не удалось прочитать файл.", true);
    }
  }
  $("file").addEventListener("change", (e) => {
    read(e.target.files[0]);
    e.target.value = "";
  });
  for (const event of ["dragenter", "dragover"])
    $("drop").addEventListener(event, (e) => {
      e.preventDefault();
      $("drop").classList.add("over");
    });
  for (const event of ["dragleave", "drop"])
    $("drop").addEventListener(event, (e) => {
      e.preventDefault();
      $("drop").classList.remove("over");
      if (event === "drop") read(e.dataTransfer.files[0]);
    });
  function insertPoint(group, latlng) {
    if (
      screenshot?.active ||
      activeDrag ||
      start ||
      mode === "select" ||
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
    state.insertBefore(next, position);
    lastPointClick = null;
    refresh();
    message("Точка добавлена. Перетащите её, чтобы уточнить положение.");
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
    updateDetails();
    syncXML();
  }
  function selectionChanged() {
    paintPoints();
    updateDetails();
  }
  function syncXML() {
    if (state.doc) {
      const xml = serialize();
      if ($("xml").value !== xml) $("xml").value = xml;
      $("code-state").textContent =
        xml === state.originalXML ? "Исходный файл" : "Скорректирован";
    }
  }
  function updateDetails() {
    $("selected").textContent = state.selected.size;
    $("count").textContent = state.doc
      ? countFormat.format(state.points.length)
      : "—";
    $("deleted").textContent = state.deletedCount;
    const distance = state.totalDistance;
    $("distance").textContent = state.doc
      ? distanceFormat.format(distance / 1000) + " км"
      : "—";
    $("remove").disabled = $("reset").disabled = !state.selected.size;
    $("download-code").disabled =
      $("download").disabled =
      $("copy").disabled =
        !state.doc || !state.points.length;
    $("undo").disabled = !state.history.length;
    $("autocorrect").disabled = !state.groups.some((group) => group.length > 1);
    $("fullscreen").disabled =
      !map || !state.doc || !state.points.length || mode !== "pan";
    $("map-hint").textContent = state.doc
      ? mode === "select"
        ? "Обведите точки рамкой · Esc — сбросить"
        : "Клик по линии — добавить · перетаскивание точки — переместить"
      : "Загрузите трек или откройте пример";
  }
  function fit() {
    screenshot?.cancel();
    if (map && state.bounds)
      map.fitBounds(state.bounds, { padding: [40, 40], maxZoom: 16 });
  }
  $("fit").onclick = fit;
  function setMode(next) {
    screenshot?.cancel();
    lastPointClick = null;
    if (fullscreenActive && next !== "pan") return;
    cancelDrag(true);
    cancelBox();
    mode = next;
    $("pan").classList.toggle("active", mode === "pan");
    $("select").classList.toggle("active", mode === "select");
    $("pan").setAttribute("aria-pressed", mode === "pan");
    $("select").setAttribute("aria-pressed", mode === "select");
    $("map").classList.toggle("selecting", mode === "select");
    if (map) {
      mode === "select" ? map.dragging.disable() : map.dragging.enable();
      mode === "select"
        ? map.doubleClickZoom.disable()
        : map.doubleClickZoom.enable();
    }
    selectionChanged();
  }
  function exitMapFullscreen() {
    screenshot?.cancel();
    if (!fullscreenActive) return;
    cancelDrag(true);
    cancelBox();
    const center = map.getCenter(),
      zoom = map.getZoom();
    fullscreenActive = false;
    document.body.classList.remove("map-fullscreen");
    map.invalidateSize({ pan: false });
    map.setView(center, zoom, { animate: false });
    schedulePaint();
    $("fullscreen").focus({ preventScroll: true });
  }
  $("fullscreen").onclick = () => {
    if (
      !map ||
      !state.doc ||
      !state.points.length ||
      mode !== "pan" ||
      fullscreenActive
    )
      return;
    cancelDrag(true);
    cancelBox();
    state.selected.clear();
    selectionChanged();
    const center = map.getCenter(),
      zoom = map.getZoom();
    screenshot?.cancel();
    fullscreenActive = true;
    document.body.classList.add("map-fullscreen");
    const target = document.querySelector(".map-wrap");
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    map.invalidateSize({ pan: false });
    map.setView(center, zoom, { animate: false });
    schedulePaint();
  };
  $("fullscreen-exit").onclick = exitMapFullscreen;
  $("help-open").onclick = () => {
    screenshot?.cancel();
    cancelDrag(true);
    cancelBox();
    lastPointClick = null;
    $("help-dialog").showModal();
  };
  $("help-close").onclick = () => $("help-dialog").close();
  $("help-dialog").addEventListener("click", (e) => {
    if (e.target !== $("help-dialog")) return;
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  });
  $("help-dialog").addEventListener("close", () =>
    $("help-open").focus({ preventScroll: true }),
  );
  $("pan").onclick = () => setMode("pan");
  $("select").onclick = () => setMode("select");
  $("reset").onclick = () => {
    state.selected.clear();
    selectionChanged();
    message("Выделение сброшено.");
  };
  function deletePoints(indices, automatic = false) {
    screenshot?.cancel();
    const count = state.remove(indices, automatic);
    if (count) {
      lastPointClick = null;
      refresh();
    }
    return count;
  }
  $("remove").onclick = () => {
    if (fullscreenActive || !state.selected.size) return;
    const count = deletePoints(state.selected);
    message(
      "Удалено точек: " + count + ". Соседние точки внутри сегмента соединены.",
    );
  };
  $("autocorrect").onclick = () => {
    if (!state.doc) return;
    cancelDrag(true);
    cancelBox();
    // Collect the entire batch before mutating the GPX; keep node references for this run.
    state.lastAutoRemoved = GPXEditor.findJumpPoints(
      state.groups,
      haversine,
      JUMP_THRESHOLD_METERS,
    );
    if (!state.lastAutoRemoved.size) {
      message(
        "Автокоррекция: завершённых вылетов с подтверждённым возвратом не найдено.",
      );
      return;
    }
    const indices = new Set();
    state.points.forEach((p, i) => {
      if (state.lastAutoRemoved.has(p.node)) indices.add(i);
    });
    const count = deletePoints(indices, true);
    fit();
    message(
      "Автокоррекция: удалено точек — " +
        count +
        ". Соседние корректные точки соединены прямыми отрезками. Изменение можно отменить.",
    );
  };
  $("undo").onclick = () => {
    screenshot?.cancel();
    cancelDrag(true);
    cancelBox();
    if (!state.undo()) return;
    lastPointClick = null;
    refresh();
    message("Последнее изменение отменено.");
  };
  $("download-code").onclick = $("download").onclick = () => {
    if (!state.doc || !state.points.length) return;
    const url = URL.createObjectURL(
        new Blob([serialize()], { type: "application/gpx+xml;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = state.filename.replace(/\.gpx$/i, "") + "-corrected.gpx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message("Исправленный GPX подготовлен к скачиванию.");
  };
  $("copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("xml").value);
      message("GPX-код скопирован.");
    } catch (e) {
      $("xml").focus();
      $("xml").select();
      message("Код выделен. Нажмите Ctrl+C или ⌘C для копирования.");
    }
  };
  let start = null,
    box = null,
    pointer = null,
    boxFrame = 0,
    boxEnd = null;
  const container = $("map");
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
    if (mode !== "select") map.dragging.enable();
    if (cancel || !d.moved) {
      d.p.lat = d.lat;
      d.p.lng = d.lng;
      state.totalDistance = d.total;
      d.editPreview.finish();
      projectPoints();
      paintPoints();
      updateDetails();
      return;
    }
    state.commitMove(d.p, d.originalLat, d.originalLon);
    lastPointClick = null;
    d.editPreview.finish();
    projectPoints();
    paintPoints();
    updateDetails();
    syncXML();
    message("Координаты точки обновлены в GPX.");
  }
  container.addEventListener(
    "pointerdown",
    (e) => {
      if (
        screenshot?.active ||
        activeDrag ||
        start ||
        mode === "select" ||
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
          L,
          p.group ? routeLines[state.groups.indexOf(p.group)] : null,
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
  container.addEventListener(
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
  container.addEventListener(
    "pointerup",
    (e) => {
      if (!activeDrag || e.pointerId !== activeDrag.pointer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const { index, moved } = activeDrag;
      cancelDrag();
      suppressPointClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
      if (moved || fullscreenActive) {
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
        state.selected.has(index)
          ? state.selected.delete(index)
          : state.selected.add(index);
        selectionChanged();
      }
    },
    { capture: true },
  );
  container.addEventListener(
    "click",
    (e) => {
      if (performance.now() < suppressPointClickUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  container.addEventListener(
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
  container.addEventListener("pointercancel", () => {
    lastPointClick = null;
    cancelDrag(true);
  });
  container.addEventListener(
    "pointerdown",
    (e) => {
      if (
        screenshot?.active ||
        activeDrag ||
        start ||
        mode !== "select" ||
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
      pointer = e.pointerId;
      container.setPointerCapture(pointer);
      box = document.createElement("div");
      box.className = "selection-box";
      container.append(box);
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
  container.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== pointer) return;
    const rect = start.rect;
    boxEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!boxFrame) boxFrame = requestAnimationFrame(renderBox);
  });
  function cancelBox() {
    if (boxFrame) {
      cancelAnimationFrame(boxFrame);
      boxFrame = 0;
    }
    boxEnd = null;
    const captured = pointer;
    if (box) box.remove();
    box = null;
    start = null;
    pointer = null;
    if (captured !== null && container.hasPointerCapture(captured))
      container.releasePointerCapture(captured);
  }
  container.addEventListener(
    "pointerup",
    (e) => {
      if (!start || e.pointerId !== pointer) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = start.rect,
        end = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (Math.abs(start.x - end.x) > 3 || Math.abs(start.y - end.y) > 3) {
        const minX = Math.min(start.x, end.x),
          maxX = Math.max(start.x, end.x),
          minY = Math.min(start.y, end.y),
          maxY = Math.max(start.y, end.y);
        projectPoints();
        pointLayer.projected.forEach((pt) => {
          if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY)
            state.selected.add(pt.i);
        });
      }
      cancelBox();
      selectionChanged();
      message(
        state.selected.size
          ? "Выбрано точек: " +
              state.selected.size +
              ". Удалите их или сбросьте выделение."
          : "В выделенной области нет точек.",
      );
    },
    { capture: true },
  );
  container.addEventListener("pointercancel", cancelBox);
  container.addEventListener("lostpointercapture", (e) => {
    if (activeDrag?.pointer === e.pointerId) cancelDrag(true);
    if (pointer === e.pointerId) cancelBox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("help-dialog").open) return;
      if (screenshot?.active) {
        screenshot.cancel();
        return;
      }
      if (fullscreenActive) {
        exitMapFullscreen();
        return;
      }
      cancelDrag(true);
      cancelBox();
      state.selected.clear();
      selectionChanged();
    }
  });
  $("demo").onclick = () => {
    loadRequest++;
    const coords = [];
    for (let i = 0; i < 110; i++) {
      const t = (i / 109) * Math.PI * 1.75;
      coords.push([53.225 + Math.sin(t) * 0.019, 50.16 + Math.cos(t) * 0.035]);
    }
    coords.splice(51, 0, [53.59, 50.91], [53.61, 50.94], [53.6, 50.96]);
    const text =
      '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GPX Editor" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Прогулка по Самаре</name></metadata><trk><name>Демонстрационный трек с GPS-выбросом</name><trkseg>\n' +
      coords
        .map(
          ([lat, lon], i) =>
            '  <trkpt lat="' +
            lat.toFixed(6) +
            '" lon="' +
            lon.toFixed(6) +
            '"><ele>80</ele><time>' +
            new Date(Date.UTC(2026, 9, 21, 7, i)).toISOString() +
            "</time></trkpt>",
        )
        .join("\n") +
      "\n</trkseg></trk></gpx>";
    load(text, "samara-demo.gpx", new Blob([text]).size);
    message(
      "Демонстрационный трек: выделите три удалённые точки на северо-востоке и удалите их.",
    );
  };
  setMode("pan");
})();
