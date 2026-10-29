import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { EditorStore } from "../src/features/editor/model/EditorStore.js";
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
function loaded() {
  const store = new EditorStore();
  const xml = `<gpx><trk><trkseg>${[0, 0.001, 0.01, 0.011, 0.002, 0.003].map((lon) => `<trkpt lat="0" lon="${lon}"/>`).join("")}</trkseg></trk></gpx>`;
  store.loadText(xml, "threshold.gpx", xml.length);
  return store;
}
test("new sessions default to 500 meters and a chosen threshold survives loading another track", () => {
  const store = loaded();
  assert.equal(store.getSnapshot().autocorrectThreshold, 500);
  assert.equal(store.getSnapshot().autocorrectThresholdInput, "500");
  store.setAutocorrectThreshold("750");
  store.loadDemo();
  assert.equal(store.getSnapshot().autocorrectThreshold, 750);
  assert.equal(new EditorStore().autocorrectThreshold, 500);
});
test("chosen threshold actually changes excursion detection without modifying GPX", () => {
  const store = loaded(),
    xml = store.model.serialize();
  store.autocorrect();
  assert.equal(store.getSnapshot().autocorrectPreview.pointCount, 2);
  assert.equal(store.getSnapshot().autocorrectPreview.threshold, 500);
  store.setAutocorrectThreshold("1500");
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  assert.equal(store.applyAutocorrect(), 0);
  store.autocorrect();
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  store.setAutocorrectThreshold("500");
  store.autocorrect();
  assert.equal(store.getSnapshot().autocorrectPreview.pointCount, 2);
  assert.equal(store.model.serialize(), xml);
  assert.equal(store.applyAutocorrect(), 2);
  store.undo();
  assert.equal(store.model.serialize(), xml);
});
test("changing the threshold invalidates preview even when the same points would be found", () => {
  const store = loaded();
  store.autocorrect();
  store.setAutocorrectThreshold("750");
  assert.equal(store.getSnapshot().autocorrectPreview, null);
  assert.equal(store.applyAutocorrect(), 0);
  store.autocorrect();
  assert.equal(store.getSnapshot().autocorrectPreview.threshold, 750);
  assert.equal(store.getSnapshot().autocorrectPreview.pointCount, 2);
});
for (const invalid of [
  "",
  "0",
  "-1",
  "1.5",
  "NaN",
  "Infinity",
  "9007199254740992",
]) {
  test(`invalid threshold ${JSON.stringify(invalid)} blocks correction`, () => {
    const store = loaded(),
      xml = store.model.serialize();
    store.autocorrect();
    store.setAutocorrectThreshold(invalid);
    assert.equal(store.getSnapshot().autocorrectThresholdValid, false);
    assert.equal(store.getSnapshot().canAutocorrect, false);
    assert.equal(store.getSnapshot().autocorrectPreview, null);
    store.autocorrect();
    assert.equal(store.applyAutocorrect(), 0);
    assert.equal(store.model.serialize(), xml);
    assert.equal(store.model.history.length, 0);
    assert.equal(store.getSnapshot().status.error, true);
    store.setAutocorrectThreshold("500");
    assert.equal(store.getSnapshot().canAutocorrect, true);
  });
}
