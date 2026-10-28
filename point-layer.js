(() => {
  "use strict";
  const CELL_SIZE = 24;
  const HIT_RADIUS_SQUARED = 100;
  const POINT_RADIUS = 4;
  const VIEWPORT_PADDING = 12;

  class PointLayer {
    constructor(map, container, model, getActiveIndex) {
      this.map = map;
      this.model = model;
      this.getActiveIndex = getActiveIndex;
      this.projected = [];
      this.grid = new Map();
      this.world = [];
      this.cachedVersion = -1;
      this.cachedZoom = -1;
      this.frame = 0;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "point-canvas";
      this.canvas.setAttribute("aria-hidden", "true");
      container.append(this.canvas);
      this.context = this.canvas.getContext("2d");
      this.onViewChanged = () => this.schedule();
      map.on("move zoom resize", this.onViewChanged);
    }

    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.project();
        this.paint();
      });
    }

    project() {
      const zoom = this.map.getZoom();
      if (
        this.cachedVersion !== this.model.version ||
        this.cachedZoom !== zoom
      ) {
        this.world = this.model.points.map((point) =>
          this.map.project([point.lat, point.lng], zoom).round(),
        );
        this.cachedVersion = this.model.version;
        this.cachedZoom = zoom;
      }
      const origin = this.map
        .getPixelOrigin()
        .add(this.map.containerPointToLayerPoint([0, 0]));
      const size = this.map.getSize();
      this.projected = [];
      this.grid.clear();
      this.world.forEach((point, i) => {
        const x = point.x - origin.x,
          y = point.y - origin.y;
        if (
          x < -VIEWPORT_PADDING ||
          y < -VIEWPORT_PADDING ||
          x > size.x + VIEWPORT_PADDING ||
          y > size.y + VIEWPORT_PADDING
        )
          return;
        const item = { x, y, i };
        this.projected.push(item);
        const key = Math.floor(x / CELL_SIZE) + "," + Math.floor(y / CELL_SIZE);
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(item);
      });
    }

    paint() {
      const size = this.map.getSize(),
        ratio = window.devicePixelRatio || 1;
      const width = Math.round(size.x * ratio),
        height = Math.round(size.y * ratio);
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = size.x + "px";
        this.canvas.style.height = size.y + "px";
      }
      const ctx = this.context;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const active = this.getActiveIndex();
      for (const chosen of [false, true]) {
        ctx.beginPath();
        for (const point of this.projected) {
          if (this.model.selected.has(point.i) !== chosen || active === point.i)
            continue;
          ctx.moveTo(point.x + POINT_RADIUS, point.y);
          ctx.arc(point.x, point.y, POINT_RADIUS, 0, 2 * Math.PI);
        }
        ctx.fillStyle = chosen ? "#e59a7d" : "#fff";
        ctx.strokeStyle = chosen ? "#b96550" : "#426e4d";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }

    pointAt(x, y) {
      // A pending pan/zoom frame must not leave hit testing at the old view.
      if (this.frame) this.project();
      let best = null,
        distance = HIT_RADIUS_SQUARED;
      const cx = Math.floor(x / CELL_SIZE),
        cy = Math.floor(y / CELL_SIZE);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          for (const point of this.grid.get(cx + dx + "," + (cy + dy)) || []) {
            const d = (point.x - x) ** 2 + (point.y - y) ** 2;
            if (d < distance) {
              distance = d;
              best = point.i;
            }
          }
        }
      return best;
    }

    destroy() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.map.off("move zoom resize", this.onViewChanged);
      this.canvas.remove();
    }
  }
  globalThis.GPXEditor.PointLayer = PointLayer;
})();
