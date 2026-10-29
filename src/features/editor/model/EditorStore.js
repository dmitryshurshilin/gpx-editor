import { TrackModel, parseGPX } from "../../../domain/gpx/TrackModel.js";
import {
  findJumpPoints,
  describeRejectedFragments,
} from "../../../domain/gpx/autocorrect.js";
import { distanceBetween } from "../../../domain/gpx/geometry.js";
import { createDemoGPX } from "../../../domain/gpx/demo.js";
import { saveBlob } from "../../../shared/lib/download.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

// React observes immutable summaries. The XML DOM and large point arrays stay
// in the domain model, outside the component tree and the pointer-move loop.
export class EditorStore {
  constructor() {
    this.model = new TrackModel();
    this.autocorrectPreview = null;
    this.mode = "pan";
    this.fullscreen = false;
    this.basemap = "street";
    this.mapReady = false;
    this.capture = { active: false, busy: false };
    this.captureFeedback = null;
    this.status = { text: "", error: false };
    this.fileSize = 0;
    this.loadRequest = 0;
    this.listeners = new Set();
    this.sceneListeners = new Set();
    this.snapshot = this.createSnapshot();
  }
  subscribe = (callback) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };
  getSnapshot = () => this.snapshot;
  subscribeScene(callback) {
    this.sceneListeners.add(callback);
    return () => this.sceneListeners.delete(callback);
  }
  command(type) {
    for (const callback of this.sceneListeners) callback({ type });
  }
  prepare() {
    this.command("prepare");
  }
  createSnapshot() {
    const model = this.model,
      xml = model.serialize();
    return Object.freeze({
      loaded: !!model.doc,
      filename: model.filename,
      fileSize: this.fileSize,
      xml,
      changed: !!model.doc && xml !== model.originalXML,
      pointCount: model.points.length,
      selectedCount: model.selected.size,
      deletedCount: model.deletedCount,
      distance: model.totalDistance,
      canUndo: !!model.history.length,
      autocorrectPreview: this.autocorrectPreview
        ? Object.freeze({
            pointCount: this.autocorrectPreview.nodes.size,
            fragmentCount: this.autocorrectPreview.fragments.length,
          })
        : null,
      canAutocorrect: model.groups.some((group) => group.length > 1),
      mode: this.mode,
      fullscreen: this.fullscreen,
      basemap: this.basemap,
      mapReady: this.mapReady,
      capture: this.capture,
      captureFeedback: this.captureFeedback,
      status: this.status,
      geometryVersion: model.version,
    });
  }
  emit(type = "ui") {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
    this.command(type);
  }
  setStatus(text, error = false) {
    this.status = { text, error };
    this.emit("status");
  }
  setMapReady(ready) {
    if (this.mapReady === ready) return;
    this.mapReady = ready;
    this.emit();
  }
  setCapture(value) {
    if (
      this.capture.active === value.active &&
      this.capture.busy === value.busy
    )
      return;
    this.capture = Object.freeze({ ...value });
    this.emit();
  }
  setCaptureFeedback(value) {
    this.captureFeedback = value;
    this.emit();
  }

  loadText(text, name, size) {
    const doc = parseGPX(text); // Validate before changing the current document.
    this.prepare();
    this.autocorrectPreview = null;
    this.model.load(doc, name);
    this.fileSize = size;
    this.status = {
      text: "Трек загружен. Включите выделение, чтобы убрать лишние точки.",
      error: false,
    };
    this.emit("load");
  }
  async loadFile(file) {
    if (!file) return;
    const request = ++this.loadRequest;
    if (file.size > MAX_FILE_BYTES) {
      this.setStatus(
        "Файл слишком большой. Максимальный размер — 20 МБ.",
        true,
      );
      return;
    }
    try {
      const text = await file.text();
      if (request !== this.loadRequest) return;
      this.loadText(text, file.name, file.size);
    } catch (error) {
      if (request === this.loadRequest)
        this.setStatus(error.message || "Не удалось прочитать файл.", true);
    }
  }
  loadDemo() {
    this.loadRequest++;
    const xml = createDemoGPX();
    this.loadText(xml, "samara-demo.gpx", new Blob([xml]).size);
    this.setStatus(
      "Демонстрационный трек: выделите три удалённые точки на северо-востоке и удалите их.",
    );
  }
  setMode(mode) {
    if (
      !["pan", "select"].includes(mode) ||
      (this.fullscreen && mode !== "pan")
    )
      return;
    this.prepare();
    this.mode = mode;
    this.emit("mode");
  }
  setBasemap(name) {
    if (!["street", "satellite"].includes(name) || name === this.basemap)
      return;
    this.prepare();
    this.basemap = name;
    this.emit("basemap");
  }
  setFullscreen(value) {
    if (
      value &&
      (!this.model.points.length || this.mode !== "pan" || !this.mapReady)
    )
      return;
    this.prepare();
    this.fullscreen = value;
    this.model.selected.clear();
    this.emit("fullscreen");
  }
  clearSelection() {
    this.prepare();
    this.model.selected.clear();
    this.status = { text: "Выделение сброшено.", error: false };
    this.emit("selection");
  }
  togglePoint(index) {
    if (this.fullscreen || !this.model.points[index]) return;
    this.model.selected.has(index)
      ? this.model.selected.delete(index)
      : this.model.selected.add(index);
    this.emit("selection");
  }
  selectIndices(indices) {
    for (const index of indices)
      if (this.model.points[index]) this.model.selected.add(index);
    this.emit("selection");
    this.setStatus(
      this.model.selected.size
        ? `Выбрано точек: ${this.model.selected.size}. Удалите их или сбросьте выделение.`
        : "В выделенной области нет точек.",
    );
  }
  remove(indices = this.model.selected) {
    if (this.fullscreen || !indices.size) return 0;
    this.prepare();
    const count = this.model.remove(indices);
    if (count) {
      this.autocorrectPreview = null;
      this.status = {
        text: `Удалено точек: ${count}. Соседние точки внутри сегмента соединены.`,
        error: false,
      };
      this.emit("geometry");
    }
    return count;
  }
  insert(next, position) {
    this.model.insertBefore(next, position);
    this.autocorrectPreview = null;
    this.status = {
      text: "Точка добавлена. Перетащите её, чтобы уточнить положение.",
      error: false,
    };
    this.emit("geometry");
  }
  commitMove(point, lat, lon) {
    this.model.commitMove(point, lat, lon);
    this.autocorrectPreview = null;
    this.status = { text: "Координаты точки обновлены в GPX.", error: false };
    this.emit("move");
  }
  undo() {
    this.prepare();
    if (!this.model.undo()) return;
    this.autocorrectPreview = null;
    this.status = { text: "Последнее изменение отменено.", error: false };
    this.emit("geometry");
  }
  autocorrect() {
    if (!this.model.doc || this.fullscreen) return;
    this.prepare();
    const nodes = findJumpPoints(this.model.groups, distanceBetween, 500);
    this.autocorrectPreview = null;
    if (!nodes.size) {
      this.status = {
        text: "Автокоррекция: завершённых вылетов с подтверждённым возвратом не найдено.",
        error: false,
      };
    } else {
      const indices = new Set();
      this.model.points.forEach((point, index) => {
        if (nodes.has(point.node)) indices.add(index);
      });
      const fragments = describeRejectedFragments(this.model.groups, nodes);
      this.autocorrectPreview = {
        nodes,
        indices,
        fragments,
        version: this.model.version,
      };
      this.status = {
        text: `Предпросмотр: найдено точек — ${nodes.size}. Проверьте выделенные фрагменты и подтвердите удаление.`,
        error: false,
      };
    }
    this.emit("autocorrect-preview");
  }
  cancelAutocorrectPreview(silent = false) {
    if (!this.autocorrectPreview) return;
    this.autocorrectPreview = null;
    if (!silent)
      this.status = {
        text: "Предпросмотр отменён. Трек не изменён.",
        error: false,
      };
    this.emit("autocorrect-preview");
  }
  applyAutocorrect() {
    if (this.fullscreen || !this.autocorrectPreview) return 0;
    this.prepare();
    const preview = this.autocorrectPreview;
    if (preview.version !== this.model.version) {
      this.autocorrectPreview = null;
      this.status = {
        text: "Трек изменился. Запустите предпросмотр заново.",
        error: true,
      };
      this.emit("autocorrect-preview");
      return 0;
    }
    this.autocorrectPreview = null;
    this.model.lastAutoRemoved = new Set(preview.nodes);
    const count = this.model.remove(preview.indices, true);
    this.status = {
      text: `Автокоррекция: удалено точек — ${count}. Соседние корректные точки соединены прямыми отрезками. Изменение можно отменить.`,
      error: false,
    };
    this.emit("load");
    return count;
  }
  download() {
    if (!this.model.points.length) return;
    saveBlob(
      new Blob([this.model.serialize()], {
        type: "application/gpx+xml;charset=utf-8",
      }),
      this.model.filename.replace(/\.gpx$/i, "") + "-corrected.gpx",
    );
    this.setStatus("Исправленный GPX подготовлен к скачиванию.");
  }
  async copy() {
    try {
      await navigator.clipboard.writeText(this.model.serialize());
      this.setStatus("GPX-код скопирован.");
      return true;
    } catch {
      this.setStatus("Код выделен. Нажмите Ctrl+C или ⌘C для копирования.");
      return false;
    }
  }
}
