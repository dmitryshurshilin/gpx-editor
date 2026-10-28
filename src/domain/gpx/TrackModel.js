import { distanceBetween, adjacentDistance } from "./geometry.js";
const POINT_NAMES = new Set(["trkpt", "rtept", "wpt"]);

// Walk once, without repeatedly indexing a live DOM collection. Extension
// elements named trkpt/rtept/wpt are metadata, not editable GPX points.
function pointNodes(doc) {
  const root = doc.documentElement;
  const result = [];
  let node = root;
  while (node) {
    if (
      node.nodeType === 1 &&
      node.namespaceURI === root.namespaceURI &&
      POINT_NAMES.has(node.localName)
    ) {
      result.push(node);
    }
    if (node.firstChild) {
      node = node.firstChild;
      continue;
    }
    while (node && node !== root && !node.nextSibling) node = node.parentNode;
    if (!node || node === root) break;
    node = node.nextSibling;
  }
  return result;
}

export function parseGPX(text) {
  if (/<!DOCTYPE/i.test(text))
    throw new Error("GPX с объявлением DOCTYPE не поддерживается.");
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (
    parsed.getElementsByTagName("parsererror").length ||
    parsed.documentElement?.localName !== "gpx"
  ) {
    throw new Error("Не удалось прочитать GPX. Проверьте формат файла.");
  }
  const nodes = pointNodes(parsed);
  if (!nodes.length)
    throw new Error("В файле нет точек трека, маршрута или путевых точек.");
  for (const node of nodes) {
    const lat = node.getAttribute("lat");
    const lon = node.getAttribute("lon");
    if (
      lat === null ||
      lon === null ||
      !lat.trim() ||
      !lon.trim() ||
      !Number.isFinite(+lat) ||
      !Number.isFinite(+lon) ||
      Math.abs(+lat) > 90 ||
      Math.abs(+lon) > 180
    ) {
      throw new Error("В файле есть точки с некорректными координатами.");
    }
  }
  return parsed;
}

export class TrackModel {
  constructor() {
    this.doc = null;
    this.points = [];
    this.groups = [];
    this.history = [];
    this.selected = new Set();
    this.lastAutoRemoved = new Set();
    this.filename = "";
    this.deletedCount = 0;
    this.totalDistance = 0;
    this.originalXML = "";
    this.bounds = null;
    this.version = 0;
    this.xmlVersion = -1;
    this.cachedXML = "";
  }

  load(parsed, filename) {
    this.doc = parsed;
    this.filename = filename;
    this.selected.clear();
    this.history = [];
    this.lastAutoRemoved.clear();
    this.deletedCount = 0;
    this.reindex();
    this.originalXML = this.serialize();
  }

  reindex() {
    const parents = new Map();
    this.groups = [];
    this.totalDistance = 0;
    this.points = pointNodes(this.doc).map((node) => {
      const point = {
        node,
        lat: +node.getAttribute("lat"),
        lng: +node.getAttribute("lon"),
        parent: node.parentNode,
      };
      if (node.localName !== "wpt") {
        if (!parents.has(point.parent)) {
          const group = [];
          parents.set(point.parent, group);
          this.groups.push(group);
        }
        const group = parents.get(point.parent);
        point.group = group;
        point.groupIndex = group.length;
        if (group.length)
          this.totalDistance += distanceBetween(group[group.length - 1], point);
        group.push(point);
      }
      return point;
    });
    this.updateBounds();
    this.version++;
  }

  updateBounds() {
    if (!this.points.length) {
      this.bounds = null;
      return;
    }
    let south = Infinity,
      west = Infinity,
      north = -Infinity,
      east = -Infinity;
    for (const point of this.points) {
      south = Math.min(south, point.lat);
      north = Math.max(north, point.lat);
      west = Math.min(west, point.lng);
      east = Math.max(east, point.lng);
    }
    this.bounds = [
      [south, west],
      [north, east],
    ];
  }

  serialize() {
    if (!this.doc) return "";
    if (this.xmlVersion !== this.version) {
      this.cachedXML =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        new XMLSerializer()
          .serializeToString(this.doc)
          .replace(/^<\?xml[^>]*>\s*/, "");
      this.xmlVersion = this.version;
    }
    return this.cachedXML;
  }

  insertBefore(next, position) {
    const node = this.doc.createElementNS(next.namespaceURI, next.nodeName);
    node.setAttribute("lat", position.lat.toFixed(7));
    node.setAttribute("lon", position.lng.toFixed(7));
    next.parentNode.insertBefore(node, next);
    this.history.push({ type: "insert", node });
    this.selected.clear();
    this.reindex();
  }

  remove(indices, automatic = false) {
    const removed = [];
    // Reverse document order lets undo restore a node before its already
    // restored successor, including adjacent points and multiple segments.
    for (let i = this.points.length - 1; i >= 0; i--) {
      if (!indices.has(i)) continue;
      const { node, parent } = this.points[i];
      removed.push({ node, parent, next: node.nextSibling });
    }
    if (!removed.length) return 0;
    this.history.push({
      type: "delete",
      removed,
      deletedCount: this.deletedCount,
      automatic,
    });
    this.deletedCount += removed.length;
    for (const { node, parent } of removed) parent.removeChild(node);
    this.selected.clear();
    this.reindex();
    return removed.length;
  }

  previewMove(point, position) {
    this.totalDistance -= adjacentDistance(point);
    point.lat = Math.max(-90, Math.min(90, position.lat));
    point.lng = ((((position.lng + 180) % 360) + 360) % 360) - 180;
    this.totalDistance += adjacentDistance(point);
  }

  commitMove(point, originalLat, originalLon) {
    const previousDistance = adjacentDistance(point);
    point.node.setAttribute("lat", point.lat.toFixed(7));
    point.node.setAttribute("lon", point.lng.toFixed(7));
    // Match the in-memory position to the actual precision saved in GPX.
    point.lat = +point.node.getAttribute("lat");
    point.lng = +point.node.getAttribute("lon");
    this.totalDistance += adjacentDistance(point) - previousDistance;
    this.history.push({
      type: "move",
      node: point.node,
      lat: originalLat,
      lon: originalLon,
    });
    this.updateBounds();
    this.version++;
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return false;
    if (previous.type === "insert")
      previous.node.parentNode.removeChild(previous.node);
    if (previous.type === "delete") {
      for (const item of previous.removed)
        item.parent.insertBefore(item.node, item.next);
      this.deletedCount = previous.deletedCount;
      if (previous.automatic) this.lastAutoRemoved.clear();
    }
    if (previous.type === "move") {
      previous.node.setAttribute("lat", previous.lat);
      previous.node.setAttribute("lon", previous.lon);
    }
    this.selected.clear();
    this.reindex();
    return true;
  }
}
