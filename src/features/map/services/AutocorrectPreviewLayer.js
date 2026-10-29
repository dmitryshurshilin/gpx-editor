// Two canvas-backed multi-polylines keep preview costs independent of fragment count.
export class AutocorrectPreviewLayer {
  constructor(map, leaflet) {
    this.leaflet = leaflet;
    this.layer = leaflet.layerGroup().addTo(map);
  }
  render(fragments = []) {
    this.layer.clearLayers();
    if (!fragments.length) return;
    this.leaflet
      .polyline(
        fragments.map((fragment) => fragment.excursion),
        {
          color: "#b76108",
          weight: 6,
          opacity: 0.8,
          dashArray: "6 5",
          interactive: false,
        },
      )
      .addTo(this.layer);
    this.leaflet
      .polyline(
        fragments.map((fragment) => fragment.connection),
        {
          color: "#245c3b",
          weight: 4,
          opacity: 0.95,
          dashArray: "4 6",
          interactive: false,
        },
      )
      .addTo(this.layer);
  }
  destroy() {
    this.layer.remove();
  }
}
