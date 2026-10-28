const coordinates = (points) => points.map((point) => [point.lat, point.lng]);

export function splitEditedRoute(group, index) {
  return {
    unchanged: [
      coordinates(group.slice(0, index)),
      coordinates(group.slice(index + 1)),
    ],
    original: coordinates(group.slice(Math.max(0, index - 1), index + 2)),
  };
}

// Keep the original adjacent edges separate from the untouched route.
// Only these two edges are dashed; the live geometry is always solid.
export class RouteEditPreview {
  constructor(map, leaflet, route, group, index) {
    this.route = route;
    this.group = group;
    this.index = index;
    this.finished = false;
    if (!route || !group) return; // Standalone waypoints have no route edges.
    const geometry = splitEditedRoute(group, index);
    this.original = geometry.original;
    route.setLatLngs(geometry.unchanged);
    this.ghost = leaflet
      .polyline(geometry.original, {
        color: "#708577",
        weight: 3,
        opacity: 0.4,
        dashArray: "6 7",
        interactive: false,
      })
      .addTo(map);
    this.live = leaflet
      .polyline(geometry.original, {
        color: "#315f45",
        weight: 4,
        opacity: 0.95,
        interactive: false,
      })
      .addTo(map);
  }

  update() {
    if (this.finished || !this.live) return;
    this.live.setLatLngs(
      coordinates(
        this.group.slice(Math.max(0, this.index - 1), this.index + 2),
      ),
    );
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    // Both commit and cancellation have already updated/restored the model.
    if (this.route) this.route.setLatLngs(coordinates(this.group));
    this.ghost?.remove();
    this.live?.remove();
  }
}
