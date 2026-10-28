import test from "node:test";
import assert from "node:assert/strict";
import {
  splitEditedRoute,
  RouteEditPreview,
} from "../src/features/map/services/RouteEditPreview.js";
import { PointLayer } from "../src/features/map/services/PointLayer.js";
test("drag preview separates adjacent original edges and restores route on finish", () => {
  const group = Array.from({ length: 5 }, (_, i) => ({ lat: i, lng: i }));
  const split = splitEditedRoute(group, 2);
  assert.deepEqual(split.unchanged, [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [3, 3],
      [4, 4],
    ],
  ]);
  assert.equal(split.original.length, 3);
  let coords,
    removed = 0,
    updates = [];
  const route = {
    setLatLngs: (v) => {
      coords = v;
    },
  };
  const leaflet = {
    polyline: (v, options) => ({
      addTo() {
        return this;
      },
      setLatLngs: (v) => updates.push(v),
      remove: () => removed++,
    }),
  };
  const preview = new RouteEditPreview({}, leaflet, route, group, 2);
  group[2].lat = 20;
  preview.update();
  assert.equal(updates[0][1][0], 20);
  preview.finish();
  preview.finish();
  assert.equal(removed, 2);
  assert.equal(coords[2][0], 20);
});
test("spatial point hit testing finds nearest point across grid boundaries", () => {
  const layer = Object.create(PointLayer.prototype);
  layer.frame = 0;
  layer.grid = new Map([
    ["0,0", [{ x: 23, y: 23, i: 2 }]],
    ["1,1", [{ x: 26, y: 26, i: 4 }]],
  ]);
  assert.equal(layer.pointAt(24, 24), 2);
  assert.equal(layer.pointAt(27, 27), 4);
  assert.equal(layer.pointAt(100, 100), null);
});
