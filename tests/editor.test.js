import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { EditorStore } from "../src/features/editor/model/EditorStore.js";
import { TrackModel, parseGPX } from "../src/domain/gpx/TrackModel.js";
import { findJumpPoints } from "../src/domain/gpx/autocorrect.js";
import { distanceBetween } from "../src/domain/gpx/geometry.js";
import { createDemoGPX } from "../src/domain/gpx/demo.js";
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
const xml = (groups) =>
  `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"><metadata><name>Original</name></metadata><trk>${groups.map((g) => `<trkseg>${g.map(([lat, lon], i) => `<trkpt lat="${lat}" lon="${lon}"><ele>42</ele><time>2026-10-28T07:00:00Z</time><extensions><note>${i}</note></extensions></trkpt>`).join("")}</trkseg>`).join("")}</trk></gpx>`;
const modelFor = (text) => {
  const m = new TrackModel();
  m.load(parseGPX(text), "track.gpx");
  return m;
};

test("delete, insert and move undo restore GPX metadata and segment boundaries", () => {
  const model = modelFor(
    xml([
      [
        [53, 50],
        [53.001, 50],
        [53.002, 50],
      ],
      [
        [54, 51],
        [54.001, 51],
      ],
    ]),
  );
  const original = model.serialize();
  model.remove(new Set([1, 2, 3]));
  assert.equal(model.points.length, 2);
  assert.deepEqual(
    model.groups.map((g) => g.length),
    [1, 1],
  );
  model.undo();
  assert.equal(model.serialize(), original);
  model.insertBefore(model.points[1].node, { lat: 53.0005, lng: 50 });
  assert.equal(model.points.length, 6);
  model.undo();
  assert.equal(model.serialize(), original);
  const point = model.points[1],
    lat = point.node.getAttribute("lat"),
    lon = point.node.getAttribute("lon");
  model.previewMove(point, { lat: 53.005, lng: 50.005 });
  assert.equal(model.serialize(), original);
  model.commitMove(point, lat, lon);
  assert.match(model.serialize(), /lat="53.0050000"/);
  assert.match(model.serialize(), /<ele>42<\/ele>/);
  model.undo();
  assert.equal(model.serialize(), original);
});
test("GPX validation rejects invalid coordinates and doctypes without replacing a loaded track", () => {
  const store = new EditorStore();
  store.loadDemo();
  const original = store.model.doc;
  assert.throws(
    () =>
      store.loadText(
        '<gpx><trk><trkseg><trkpt lat="91" lon="50"/></trkseg></trk></gpx>',
        "invalid.gpx",
        1,
      ),
    /координат/,
  );
  assert.equal(store.model.doc, original);
  assert.throws(() => parseGPX("<!DOCTYPE gpx><gpx/>"), /DOCTYPE/);
  assert.throws(() => parseGPX("<gpx/>"), /нет точек/);
});
test("autocorrection removes the complete excursion and retains first returning point", () => {
  const store = new EditorStore();
  store.loadDemo();
  const original = store.model.serialize();
  assert.equal(store.model.points.length, 113);
  const returnNode = store.model.points[54].node;
  store.autocorrect();
  assert.equal(store.model.points.length, 113);
  assert.equal(store.model.serialize(), original);
  assert.equal(store.getSnapshot().autocorrectPreview.pointCount, 3);
  store.applyAutocorrect();
  assert.equal(store.model.points.length, 110);
  assert.equal(store.model.lastAutoRemoved.size, 3);
  assert.equal(store.model.points[51].node, returnNode);
  store.undo();
  assert.equal(store.model.serialize(), original);
  assert.equal(store.model.lastAutoRemoved.size, 0);
});
test("autocorrection retains unconfirmed tails and treats segments independently", () => {
  const model = modelFor(
    xml([
      [
        [53, 50],
        [53.001, 50],
        [54, 51],
        [54.001, 51],
      ],
      [
        [53, 50],
        [53.001, 50],
      ],
    ]),
  );
  assert.equal(findJumpPoints(model.groups, distanceBetween).size, 0);
  const points = [0, 100, 601, 701, 1202, 1302].map((x, i) => ({ x, node: i }));
  assert.deepEqual(
    [...findJumpPoints([points], (a, b) => Math.abs(a.x - b.x))],
    [2, 3],
  );
  const exact = [0, 501, 1001, 1100].map((x, i) => ({ x, node: i }));
  assert.equal(findJumpPoints([exact], (a, b) => Math.abs(a.x - b.x)).size, 0);
});
test("cached snapshots and XML stay stable during preview and status updates", () => {
  const store = new EditorStore();
  store.loadDemo();
  const first = store.getSnapshot();
  assert.equal(store.getSnapshot(), first);
  const version = store.model.version;
  const point = store.model.points[0];
  store.model.previewMove(point, { lat: point.lat + 0.001, lng: point.lng });
  assert.equal(store.getSnapshot(), first);
  assert.equal(store.model.version, version);
  store.setStatus("Testing");
  assert.equal(store.getSnapshot().xml, first.xml);
  assert.notEqual(store.getSnapshot(), first);
});
test("fullscreen is restricted to editing and prevents point deletion", () => {
  const store = new EditorStore();
  store.setMapReady(true);
  store.setFullscreen(true);
  assert.equal(store.fullscreen, false);
  store.loadDemo();
  store.setMode("select");
  store.setFullscreen(true);
  assert.equal(store.fullscreen, false);
  store.setMode("pan");
  store.setFullscreen(true);
  assert.equal(store.fullscreen, true);
  assert.equal(store.remove(new Set([1])), 0);
  store.setMode("select");
  assert.equal(store.mode, "pan");
  store.setFullscreen(false);
  assert.equal(store.remove(new Set([1])), 1);
});
test("newer file load wins even if an earlier file finishes later", async () => {
  const store = new EditorStore();
  let finish;
  const earlier = store.loadFile({
    name: "older.gpx",
    size: 1,
    text: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await store.loadFile({
    name: "latest.gpx",
    size: 1,
    text: async () => createDemoGPX(),
  });
  finish(createDemoGPX());
  await earlier;
  assert.equal(store.getSnapshot().filename, "latest.gpx");
});
test("store subscriptions release listeners and scene commands are separate from UI snapshots", () => {
  const store = new EditorStore();
  let ui = 0,
    scene = 0;
  const unsub = store.subscribe(() => ui++),
    unscene = store.subscribeScene(() => scene++);
  store.command("fit");
  assert.equal(ui, 0);
  assert.equal(scene, 1);
  store.setStatus("Ready");
  assert.equal(ui, 1);
  assert.equal(scene, 2);
  unsub();
  unscene();
  store.setStatus("Done");
  assert.equal(ui, 1);
  assert.equal(scene, 2);
});
