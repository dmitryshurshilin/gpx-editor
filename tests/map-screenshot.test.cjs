const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function environment() {
  const draws = [],
    text = [],
    frames = new Map();
  const ctx = {
    scale() {},
    fillRect() {},
    save() {},
    beginPath() {},
    rect() {},
    clip() {},
    restore() {},
    measureText(value) {
      return { width: value.length * 5 };
    },
    drawImage(...args) {
      draws.push(args);
    },
    fillText(value) {
      text.push(value);
    },
  };
  function element() {
    return {
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      append() {},
      addEventListener() {},
      remove() {},
      getContext() {
        return ctx;
      },
    };
  }
  const context = vm.createContext({
    GPXEditor: {},
    window: { devicePixelRatio: 2 },
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
    document: { createElement: element },
    getComputedStyle() {
      return { opacity: "1", display: "block", visibility: "visible" };
    },
    requestAnimationFrame(fn) {
      frames.set(frames.size + 1, fn);
      return frames.size;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  });
  vm.runInContext(
    readFileSync(path.join(__dirname, "../map-screenshot.js"), "utf8"),
    context,
  );
  const tile = {
    tagName: "IMG",
    complete: true,
    naturalWidth: 256,
    parentElement: null,
    getBoundingClientRect() {
      return {
        left: 10,
        top: 20,
        right: 266,
        bottom: 276,
        width: 256,
        height: 256,
      };
    },
  };
  const vectors = {
    tagName: "CANVAS",
    width: 512,
    height: 512,
    parentElement: null,
    getBoundingClientRect: tile.getBoundingClientRect,
  };
  const container = {
    getBoundingClientRect() {
      return { left: 10, top: 20 };
    },
    querySelector() {
      return { textContent: "© OpenStreetMap" };
    },
    querySelectorAll(selector) {
      assert.ok(!selector.includes("button"));
      return [tile, vectors];
    },
    append() {},
  };
  return {
    api: context.GPXEditor,
    element,
    container,
    tile,
    draws,
    text,
    frames,
  };
}

test("screenshot rectangles normalize reverse drags and clip to the map", () => {
  const { api } = environment();
  const rect = api.selectionRect(
    { x: 150, y: 200 },
    { x: -20, y: 20 },
    { x: 100, y: 100 },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(rect)), {
    x: 0,
    y: 20,
    width: 100,
    height: 80,
  });
});

test("PNG composition includes tiles, route canvas, crop offset and source attribution", () => {
  const { api, container, draws, text } = environment();
  const output = api.renderMapCrop(container, {
    x: 20,
    y: 30,
    width: 100,
    height: 80,
  });
  assert.equal(output.width, 200);
  assert.ok(output.height > 160); // Attribution is added below the selected map area.
  assert.equal(draws.length, 2);
  assert.deepEqual(draws[0].slice(1), [-20, -30, 256, 256]);
  assert.ok(text.join("").includes("OpenStreetMap"));
});

test("incomplete map imagery cannot silently produce a blank screenshot", () => {
  const { api, container, tile } = environment();
  tile.complete = false;
  assert.throws(
    () => api.renderMapCrop(container, { x: 0, y: 0, width: 100, height: 100 }),
    /загрузки карты/,
  );
  container.querySelectorAll = () => [];
  assert.throws(
    () => api.renderMapCrop(container, { x: 0, y: 0, width: 100, height: 100 }),
    /ещё не загрузилась/,
  );
});

test("screenshot cancellation restores the exact navigation modes without editing GPX", () => {
  const { api, container, element } = environment();
  const states = {
    dragging: false,
    scrollWheelZoom: true,
    doubleClickZoom: false,
    touchZoom: true,
    boxZoom: false,
    keyboard: true,
  };
  const map = { on() {}, stop() {} };
  for (const [name, enabled] of Object.entries(states)) {
    map[name] = {
      value: enabled,
      enabled() {
        return this.value;
      },
      disable() {
        this.value = false;
      },
      enable() {
        this.value = true;
      },
    };
  }
  let prepared = 0;
  const capture = new api.MapScreenshot(
    map,
    container,
    element(),
    element(),
    () => prepared++,
    () => {},
  );
  capture.start();
  assert.equal(capture.active, true);
  assert.equal(prepared, 1);
  for (const name of Object.keys(states)) assert.equal(map[name].value, false);
  capture.cancel();
  capture.cancel();
  assert.equal(capture.active, false);
  for (const [name, enabled] of Object.entries(states))
    assert.equal(map[name].value, enabled);
});

test("PNG filenames use local date/time with zero-padded components", () => {
  const { api } = environment();
  assert.equal(
    api.screenshotFileName(new Date(2026, 9, 28, 7, 4, 9)),
    "map-screen_20261028-070409.png",
  );
  assert.equal(
    api.screenshotFileName(new Date(2027, 0, 2, 0, 0, 0)),
    "map-screen_20270102-000000.png",
  );
  assert.match(
    api.screenshotFileName(),
    /^map-screen_\d{8}-\d{6}\.png$/,
  );
});
