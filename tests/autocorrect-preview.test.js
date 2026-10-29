import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { EditorStore } from "../src/features/editor/model/EditorStore.js";
import { describeRejectedFragments } from "../src/domain/gpx/autocorrect.js";
import { AutocorrectPreviewLayer } from "../src/features/map/services/AutocorrectPreviewLayer.js";
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
function loaded() {
  const store = new EditorStore();
  store.loadDemo();
  return store;
}

test("preview and cancellation preserve GPX, history, distance and manual selection", () => {
  const store = loaded(),
    original = store.model.serialize(),
    distance = store.model.totalDistance;
  store.selectIndices([0]);
  store.autocorrect();
  assert.equal(store.model.points.length, 113);
  assert.equal(store.model.serialize(), original);
  assert.equal(store.model.history.length, 0);
  assert.equal(store.model.deletedCount, 0);
  assert.equal(store.model.totalDistance, distance);
  assert.equal(store.getSnapshot().autocorrectPreview.pointCount, 3);
  assert.equal(store.getSnapshot().autocorrectPreview.fragmentCount, 1);
  assert.deepEqual([...store.model.selected], [0]);
  assert.equal(store.model.lastAutoRemoved.size, 0);
  store.cancelAutocorrectPreview();
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  assert.equal(store.model.serialize(), original);
  assert.deepEqual([...store.model.selected], [0]);
  assert.equal(store.applyAutocorrect(), 0);
});
test("confirm deletes only previewed nodes and is a single undoable operation", () => {
  const store = loaded(),
    original = store.model.serialize();
  store.selectIndices([0]);
  const kept = store.model.points[0].node;
  store.autocorrect();
  assert.equal(store.applyAutocorrect(), 3);
  assert.equal(store.model.points.length, 110);
  assert.equal(store.model.points[0].node, kept);
  assert.equal(store.model.history.length, 1);
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  assert.equal(store.applyAutocorrect(), 0);
  store.undo();
  assert.equal(store.model.serialize(), original);
});
test("a stale preview cannot delete points after an intervening model edit", () => {
  const store = loaded();
  store.autocorrect();
  store.model.remove(new Set([0]));
  const afterEdit = store.model.serialize();
  assert.equal(store.applyAutocorrect(), 0);
  assert.equal(store.model.serialize(), afterEdit);
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  assert.equal(store.getSnapshot().status.error, true);
});
for (const action of ["remove", "insert", "move", "load", "undo"]) {
  test(`committed ${action} invalidates the correction preview`, () => {
    const store = loaded();
    if (action === "undo") store.remove(new Set([0]));
    store.autocorrect();
    if (action === "remove") store.remove(new Set([0]));
    if (action === "insert")
      store.insert(store.model.points[1].node, { lat: 53.2255, lng: 50.195 });
    if (action === "move") {
      const point = store.model.points[0],
        lat = point.node.getAttribute("lat"),
        lon = point.node.getAttribute("lon");
      store.model.previewMove(point, { lat: 53.226, lng: 50.196 });
      store.commitMove(point, lat, lon);
    }
    if (action === "load") store.loadDemo();
    if (action === "undo") store.undo();
    assert.equal(store.getSnapshot().autocorrectPreview, null);
    assert.equal(store.applyAutocorrect(), 0);
  });
}
test("no completed excursion creates neither a preview nor a history entry", () => {
  const store = loaded();
  store.autocorrect();
  store.applyAutocorrect();
  const xml = store.model.serialize(),
    history = store.model.history.length;
  store.autocorrect();
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  assert.equal(store.model.serialize(), xml);
  assert.equal(store.model.history.length, history);
});
test("fullscreen can display a preview but cannot apply deletion", () => {
  const store = loaded();
  store.setMapReady(true);
  store.autocorrect();
  store.setFullscreen(true);
  assert.equal(store.applyAutocorrect(), 0);
  assert.equal(store.model.points.length, 113);
  assert.ok(store.getSnapshot().autocorrectPreview);
  store.setFullscreen(false);
  assert.equal(store.applyAutocorrect(), 3);
});
test("preview connections include the correct anchors and never cross segments", () => {
  const groups = [
    Array.from({ length: 8 }, (_, i) => ({ lat: i, lng: i, node: {} })),
    Array.from({ length: 3 }, (_, i) => ({
      lat: 100 + i,
      lng: 100 + i,
      node: {},
    })),
  ];
  const rejected = new Set([
    groups[0][1].node,
    groups[0][2].node,
    groups[0][5].node,
    groups[1][1].node,
  ]);
  const fragments = describeRejectedFragments(groups, rejected);
  assert.equal(fragments.length, 3);
  assert.deepEqual(
    fragments.map((f) => f.connection),
    [
      [
        [0, 0],
        [3, 3],
      ],
      [
        [4, 4],
        [6, 6],
      ],
      [
        [100, 100],
        [102, 102],
      ],
    ],
  );
  assert.deepEqual(fragments[0].excursion, [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ]);
  groups[0][0].lat = 10;
  assert.equal(fragments[0].connection[0][0], 0);
});
test("map preview batches many fragments into two non-interactive polylines", () => {
  const rendered = [];
  let clears = 0,
    removed = 0;
  const leaflet = {
    layerGroup: () => ({
      addTo() {
        return this;
      },
      clearLayers() {
        clears++;
      },
      remove() {
        removed++;
      },
    }),
    polyline: (coords, options) => ({
      addTo() {
        rendered.push({ coords, options });
        return this;
      },
    }),
  };
  const layer = new AutocorrectPreviewLayer({}, leaflet),
    fragments = [
      {
        excursion: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
        connection: [
          [0, 0],
          [2, 2],
        ],
      },
      {
        excursion: [
          [4, 4],
          [5, 5],
          [6, 6],
        ],
        connection: [
          [4, 4],
          [6, 6],
        ],
      },
    ];
  layer.render(fragments);
  assert.equal(rendered.length, 2);
  assert.equal(rendered[0].coords.length, 2);
  assert.ok(rendered.every((line) => line.options.interactive === false));
  layer.render();
  assert.equal(clears, 2);
  assert.equal(rendered.length, 2);
  layer.destroy();
  assert.equal(removed, 1);
});
