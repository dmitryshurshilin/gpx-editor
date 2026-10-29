import test from "node:test";
import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";
import { createPointInteractions } from "../src/features/map/services/PointInteractions.js";
import { MapScreenshot } from "../src/features/map/services/MapScreenshot.js";
// Real DOM EventTargets allow the map's many listeners on one AbortSignal.
setMaxListeners(30);

function environment(t) {
  const frames = new Map(),
    downloads = [],
    notices = [];
  let nextFrame = 0;
  const doc = new EventTarget();
  doc.defaultView = new EventTarget();
  const context = {
    scale() {},
    fillRect() {},
    save() {},
    beginPath() {},
    rect() {},
    clip() {},
    restore() {},
    drawImage() {},
    fillText() {},
    measureText: (text) => ({ width: text.length * 5 }),
  };
  class Element extends EventTarget {
    constructor() {
      super();
      this.ownerDocument = doc;
      this.style = {};
      this.children = [];
      this.captured = null;
    }
    closest() {
      return null;
    }
    append(child) {
      this.children.push(child);
      child.parentElement = this;
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (child) => child !== this,
        );
    }
    setPointerCapture(id) {
      if (this.captureError) throw this.captureError;
      this.captured = id;
    }
    hasPointerCapture(id) {
      return this.captured === id;
    }
    releasePointerCapture() {
      this.captured = null;
    }
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: 500,
        bottom: 500,
        width: 500,
        height: 500,
      };
    }
    getContext() {
      return context;
    }
    toBlob(callback) {
      callback(new Blob(["PNG"]));
    }
    click() {
      downloads.push(this.download);
    }
  }
  doc.createElement = () => new Element();
  const original = new Map();
  const globals = {
    document: doc,
    window: { devicePixelRatio: 1 },
    getComputedStyle: () => ({
      opacity: "1",
      display: "block",
      visibility: "visible",
    }),
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: () => 0,
    clearTimeout() {},
  };
  for (const [name, value] of Object.entries(globals)) {
    original.set(name, {
      exists: Object.hasOwn(globalThis, name),
      value: globalThis[name],
    });
    globalThis[name] = value;
  }
  t.after(() => {
    for (const [name, previous] of original) {
      if (previous.exists) globalThis[name] = previous.value;
      else delete globalThis[name];
    }
  });
  const container = new Element();
  const tile = new Element();
  tile.tagName = "IMG";
  tile.complete = true;
  tile.naturalWidth = 256;
  container.querySelector = () => ({ textContent: "© OpenStreetMap" });
  container.querySelectorAll = () => [tile];
  function send(target, type, x, y, { id = 1, buttons = 1, ...extra } = {}) {
    const event = new Event(type, { cancelable: true, bubbles: true });
    Object.assign(event, {
      pointerId: id,
      pointerType: "mouse",
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
      ...extra,
    });
    target.dispatchEvent(event);
  }
  async function flush() {
    for (let i = 0; i < 6; i++) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
      await Promise.resolve();
    }
  }
  function points() {
    const selections = [];
    const controller = createPointInteractions({
      map: {},
      container,
      editor: {
        mode: "select",
        model: { doc: {} },
        selectIndices: (indices) => selections.push(indices),
      },
      pointLayer: {
        project() {},
        projected: [
          { x: 50, y: 50, i: 0 },
          { x: 150, y: 150, i: 1 },
          { x: 300, y: 300, i: 2 },
        ],
      },
      getRouteLines: () => [],
      isCapturing: () => false,
    });
    t.after(() => controller.destroy());
    return { controller, selections };
  }
  function screenshot() {
    const capture = new MapScreenshot(
      { on() {}, off() {}, stop() {}, getSize: () => ({ x: 500, y: 500 }) },
      container,
      {
        beforeExport() {},
        notify: (text) => notices.push(text),
        onStateChange() {},
        onFeedback() {},
      },
    );
    capture.start();
    t.after(() => capture.destroy());
    return capture;
  }
  return {
    doc,
    container,
    frames,
    downloads,
    notices,
    send,
    flush,
    points,
    screenshot,
  };
}

test("point selection uses release coordinates before any animation frame", (t) => {
  const env = environment(t),
    { selections } = env.points();
  env.send(env.container, "pointerdown", 10, 10);
  env.send(env.doc, "pointermove", 60, 60);
  assert.equal(env.frames.size, 1);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  assert.deepEqual(selections, [[0, 1]]);
  assert.equal(env.frames.size, 0);
});
test("point selection survives capture loss and release on the document", (t) => {
  const env = environment(t),
    { controller, selections } = env.points();
  env.send(env.container, "pointerdown", 200, 200);
  env.send(env.doc, "pointermove", 150, 150);
  env.send(env.container, "lostpointercapture", 150, 150);
  assert.equal(controller.active, true);
  env.send(env.doc, "pointerup", 10, 10, { buttons: 0 });
  assert.deepEqual(selections, [[0, 1]]);
  assert.equal(controller.active, false);
});
test("point selection works without an intermediate move or pointer capture", (t) => {
  const env = environment(t),
    { selections } = env.points();
  env.container.captureError = new DOMException(
    "Pointer already inactive",
    "NotFoundError",
  );
  env.send(env.container, "pointerdown", 10, 10);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  assert.deepEqual(selections, [[0, 1]]);
});
test("unrelated pointer cancellation is ignored; blur cancels and removes listeners", (t) => {
  const env = environment(t),
    { controller, selections } = env.points();
  env.send(env.container, "pointerdown", 10, 10);
  env.send(env.doc, "pointercancel", 100, 100, { id: 2 });
  assert.equal(controller.active, true);
  env.doc.defaultView.dispatchEvent(new Event("blur"));
  assert.equal(controller.active, false);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  assert.deepEqual(selections, []);
  env.send(env.container, "pointerdown", 10, 10, { id: 3 });
  env.send(env.doc, "pointerup", 200, 200, { id: 3, buttons: 0 });
  assert.deepEqual(selections, [[0, 1]]);
});
test("genuine pointer cancellation clears a pending selection without committing it", (t) => {
  const env = environment(t),
    { controller, selections } = env.points();
  env.send(env.container, "pointerdown", 10, 10);
  env.send(env.doc, "pointermove", 100, 100);
  env.send(env.doc, "pointercancel", 100, 100);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  assert.equal(controller.active, false);
  assert.deepEqual(selections, []);
  assert.equal(env.frames.size, 0);
});
test("fast screenshot release before a frame exports exactly one PNG", async (t) => {
  const env = environment(t),
    capture = env.screenshot();
  env.send(capture.overlay, "pointerdown", 10, 10);
  env.send(env.doc, "pointermove", 30, 30);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  assert.deepEqual(capture.endPoint, { x: 200, y: 200 });
  assert.equal(capture.busy, true);
  env.send(env.doc, "mouseup", 200, 200, { buttons: 0 });
  await env.flush();
  assert.equal(env.downloads.length, 1);
  assert.match(env.downloads[0], /^map-screen_\d{8}-\d{6}\.png$/);
  assert.equal(capture.active, false);
  assert.equal(capture.busy, false);
});
test("screenshot survives capture loss and does not need to wait at the endpoint", async (t) => {
  const env = environment(t),
    capture = env.screenshot();
  env.send(capture.overlay, "pointerdown", 200, 200);
  env.send(capture.overlay, "lostpointercapture", 150, 150);
  assert.equal(capture.active, true);
  env.send(env.doc, "pointerup", 10, 10, { buttons: 0 });
  await env.flush();
  assert.equal(env.downloads.length, 1);
  assert.equal(capture.active, false);
});
test("screenshot capture failure still exports using document release", async (t) => {
  const env = environment(t),
    capture = env.screenshot();
  capture.overlay.captureError = new DOMException(
    "Pointer already inactive",
    "NotFoundError",
  );
  env.send(capture.overlay, "pointerdown", 10, 10);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  await env.flush();
  assert.equal(env.downloads.length, 1);
});
for (const release of ["mouseup", "pointermove"]) {
  test(`mouse release fallback (${release}) finishes once without pointerup`, async (t) => {
    const env = environment(t),
      capture = env.screenshot();
    env.send(capture.overlay, "pointerdown", 10, 10);
    env.send(env.doc, release, 200, 200, { buttons: 0 });
    env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
    await env.flush();
    assert.equal(env.downloads.length, 1);
  });
}
test("explicit cancellation during pending PNG frames never downloads an image", async (t) => {
  const env = environment(t),
    capture = env.screenshot();
  env.send(capture.overlay, "pointerdown", 10, 10);
  env.send(env.doc, "pointerup", 200, 200, { buttons: 0 });
  capture.cancel();
  await env.flush();
  assert.equal(env.downloads.length, 0);
  assert.equal(capture.active, false);
});
