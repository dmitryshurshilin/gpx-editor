(() => {
  "use strict";
  const MAX_PIXELS = 16000000;
  const MIN_SELECTION = 32;
  const HANDLERS = [
    "dragging",
    "scrollWheelZoom",
    "doubleClickZoom",
    "touchZoom",
    "boxZoom",
    "keyboard",
  ];

  function screenshotFileName(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    const day =
      String(date.getFullYear()).padStart(4, "0") +
      pad(date.getMonth() + 1) +
      pad(date.getDate());
    const time =
      pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
    return `map-screen_${day}-${time}.png`;
  }

  function selectionRect(start, end, size) {
    const clamp = (value, max) => Math.max(0, Math.min(max, value));
    const x1 = clamp(start.x, size.x),
      x2 = clamp(end.x, size.x);
    const y1 = clamp(start.y, size.y),
      y2 = clamp(end.y, size.y);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  function intersects(rect, crop, origin) {
    return (
      rect.right > origin.left + crop.x &&
      rect.left < origin.left + crop.x + crop.width &&
      rect.bottom > origin.top + crop.y &&
      rect.top < origin.top + crop.y + crop.height
    );
  }

  function wrapText(ctx, text, width) {
    const lines = [];
    let line = "";
    for (const character of text.replace(/\s+/g, " ").trim()) {
      if (line && ctx.measureText(line + character).width > width) {
        lines.push(line.trim());
        line = "";
      }
      line += character;
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  }

  // Composite the already loaded CORS-enabled tiles and the two vector canvases.
  // No map, track or image is uploaded anywhere to create the PNG.
  function renderMapCrop(container, crop) {
    const origin = container.getBoundingClientRect();
    const attribution =
      container.querySelector(".leaflet-control-attribution")?.textContent ||
      "";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Браузер не поддерживает создание скриншота.");
    ctx.font = "11px Arial, sans-serif";
    const lines = wrapText(ctx, attribution, Math.max(1, crop.width - 16));
    const footerHeight = lines.length ? lines.length * 15 + 12 : 0;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(MAX_PIXELS / (crop.width * (crop.height + footerHeight))),
    );
    canvas.width = Math.max(1, Math.round(crop.width * ratio));
    canvas.height = Math.max(
      1,
      Math.round((crop.height + footerHeight) * ratio),
    );
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#e9eee4";
    ctx.fillRect(0, 0, crop.width, crop.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, crop.width, crop.height);
    ctx.clip();
    let tiles = 0;
    const sources = container.querySelectorAll(
      ".leaflet-tile-pane img.leaflet-tile, .leaflet-overlay-pane canvas, canvas.point-canvas",
    );
    for (const source of sources) {
      const rect = source.getBoundingClientRect();
      if (!rect.width || !rect.height || !intersects(rect, crop, origin))
        continue;
      let opacity = 1,
        visible = true;
      for (
        let node = source;
        node && node !== container;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") {
          visible = false;
          break;
        }
        opacity *= Number(style.opacity || 1);
      }
      if (!visible || opacity === 0) continue;
      if (source.tagName === "IMG") {
        if (!source.complete || !source.naturalWidth)
          throw new Error(
            "Подождите загрузки карты и выделите область ещё раз.",
          );
        tiles++;
      } else if (!source.width || !source.height) continue;
      ctx.globalAlpha = opacity;
      ctx.drawImage(
        source,
        rect.left - origin.left - crop.x,
        rect.top - origin.top - crop.y,
        rect.width,
        rect.height,
      );
    }
    ctx.restore();
    if (!tiles)
      throw new Error(
        "Карта ещё не загрузилась. Подождите и повторите скриншот.",
      );
    ctx.globalAlpha = 1;
    if (footerHeight) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, crop.height, crop.width, footerHeight);
      ctx.fillStyle = "#34443a";
      ctx.font = "11px Arial, sans-serif";
      ctx.textBaseline = "top";
      lines.forEach((line, i) =>
        ctx.fillText(line, 8, crop.height + 6 + i * 15),
      );
    }
    return canvas;
  }

  class MapScreenshot {
    constructor(map, container, button, feedback, beforeExport, notify) {
      this.map = map;
      this.container = container;
      this.button = button;
      this.feedback = feedback;
      this.beforeExport = beforeExport;
      this.notify = notify;
      this.active = false;
      this.session = 0;
      this.pointer = null;
      this.boxFrame = 0;
      this.button.disabled = false;
      button.onclick = () => (this.active ? this.cancel() : this.start());
      map.on("resize", () => this.cancel());
    }

    status(text, error = false) {
      clearTimeout(this.feedbackTimer);
      this.feedback.textContent = text;
      this.feedback.classList.toggle("error", error);
      this.notify(text, error);
      this.feedbackTimer = setTimeout(() => {
        this.feedback.textContent = "";
      }, 8000);
    }

    start() {
      if (this.active) return;
      this.beforeExport();
      this.map.stop();
      this.active = true;
      this.session++;
      this.feedback.textContent = "";
      this.button.classList.add("active");
      this.button.setAttribute("aria-pressed", "true");
      this.savedHandlers = HANDLERS.map((name) => [
        name,
        !!this.map[name]?.enabled(),
      ]);
      this.savedHandlers.forEach(([name]) => this.map[name]?.disable());
      this.overlay = document.createElement("div");
      this.overlay.className = "map-capture-overlay";
      const instruction = document.createElement("p");
      instruction.className = "capture-instruction";
      instruction.textContent = "Выделите область для PNG · Esc — отмена";
      this.overlay.append(instruction);
      this.container.append(this.overlay);
      this.overlay.addEventListener("pointerdown", (e) => this.pointerDown(e));
      this.overlay.addEventListener("pointermove", (e) => this.pointerMove(e));
      this.overlay.addEventListener("pointerup", (e) => this.pointerUp(e));
      this.overlay.addEventListener("pointercancel", () => this.cancel());
      this.overlay.addEventListener("lostpointercapture", (e) => {
        if (this.pointer === e.pointerId) this.cancel();
      });
      this.overlay.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    position(e) {
      return {
        x: e.clientX - this.origin.left,
        y: e.clientY - this.origin.top,
      };
    }

    pointerDown(e) {
      if (e.button !== 0 || this.pointer !== null || this.busy) return;
      e.preventDefault();
      e.stopPropagation();
      this.origin = this.container.getBoundingClientRect();
      this.startPoint = this.position(e);
      this.endPoint = this.startPoint;
      this.pointer = e.pointerId;
      this.overlay.setPointerCapture(this.pointer);
      this.box?.remove();
      this.box = document.createElement("div");
      this.box.className = "capture-box";
      this.overlay.append(this.box);
      this.paintBox();
    }

    pointerMove(e) {
      if (e.pointerId !== this.pointer) return;
      e.preventDefault();
      e.stopPropagation();
      this.endPoint = this.position(e);
      if (!this.boxFrame)
        this.boxFrame = requestAnimationFrame(() => {
          this.boxFrame = 0;
          this.paintBox();
        });
    }

    paintBox() {
      if (!this.box || !this.startPoint) return;
      const rect = selectionRect(
        this.startPoint,
        this.endPoint,
        this.map.getSize(),
      );
      Object.assign(this.box.style, {
        left: rect.x + "px",
        top: rect.y + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      });
    }

    async pointerUp(e) {
      if (e.pointerId !== this.pointer) return;
      e.preventDefault();
      e.stopPropagation();
      const pointer = this.pointer;
      this.pointer = null;
      if (this.overlay.hasPointerCapture(pointer))
        this.overlay.releasePointerCapture(pointer);
      this.endPoint = this.position(e);
      this.paintBox();
      const crop = selectionRect(
        this.startPoint,
        this.endPoint,
        this.map.getSize(),
      );
      if (crop.width < MIN_SELECTION || crop.height < MIN_SELECTION) {
        this.status("Выделите область размером хотя бы 32 × 32 пикселя.", true);
        return;
      }
      const session = this.session;
      this.busy = true;
      this.button.disabled = true;
      try {
        // Leaflet and PointLayer both draw in animation frames. Let them finish.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        if (!this.active || session !== this.session) return;
        const canvas = renderMapCrop(this.container, crop);
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Не удалось создать PNG.")),
            "image/png",
          );
        });
        canvas.width = 0;
        canvas.height = 0;
        if (!this.active || session !== this.session) return;
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = screenshotFileName();
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.cancel();
        this.status("Скриншот выбранной области сохранён в PNG.");
      } catch (error) {
        this.cancel();
        this.status(
          error.name === "SecurityError"
            ? "Источник карты запретил экспорт изображения. Переключите фон карты и повторите."
            : error.message || "Не удалось сохранить скриншот.",
          true,
        );
      } finally {
        if (session === this.session || !this.active) {
          this.busy = false;
          this.button.disabled = false;
        }
      }
    }

    cancel() {
      if (!this.active) return;
      this.active = false;
      this.busy = false;
      this.session++;
      if (this.boxFrame) cancelAnimationFrame(this.boxFrame);
      this.boxFrame = 0;
      const pointer = this.pointer;
      this.pointer = null;
      if (pointer !== null && this.overlay.hasPointerCapture(pointer))
        this.overlay.releasePointerCapture(pointer);
      this.overlay.remove();
      this.overlay = null;
      this.box = null;
      this.startPoint = null;
      this.savedHandlers.forEach(([name, enabled]) => {
        if (enabled) this.map[name]?.enable();
      });
      this.button.classList.remove("active");
      this.button.setAttribute("aria-pressed", "false");
      this.button.disabled = false;
    }
  }

  Object.assign(globalThis.GPXEditor, {
    MapScreenshot,
    renderMapCrop,
    selectionRect,
    screenshotFileName,
  });
})();
