(() => {
  "use strict";

  class BasemapLayers {
    constructor(map, leaflet, onError = () => {}) {
      this.map = map;
      this.current = null;
      this.errorReported = false;
      this.layers = {
        street: leaflet.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            crossOrigin: "anonymous",
            maxZoom: 19,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        ),
        satellite: leaflet.tileLayer(
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            crossOrigin: "anonymous",
            maxZoom: 19,
            maxNativeZoom: 19,
            attribution:
              'Tiles © <a href="https://www.esri.com/">Esri</a> — Esri, Maxar, Earthstar Geographics, GIS User Community',
          },
        ),
      };
      for (const [name, layer] of Object.entries(this.layers)) {
        layer.on("tileerror", () => {
          if (this.current !== name || this.errorReported) return;
          this.errorReported = true;
          onError(name);
        });
      }
      this.select("street");
    }

    select(name) {
      if (!Object.hasOwn(this.layers, name) || this.current === name)
        return false;
      if (this.current) this.map.removeLayer(this.layers[this.current]);
      this.current = name;
      this.errorReported = false;
      this.layers[name].addTo(this.map);
      return true;
    }
  }

  globalThis.GPXEditor.BasemapLayers = BasemapLayers;
})();
