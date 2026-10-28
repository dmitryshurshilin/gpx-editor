const EARTH_RADIUS = 6371000;
const TO_RADIANS = Math.PI / 180;

export function distanceBetween(a, b) {
  const latitude = (b.lat - a.lat) * TO_RADIANS;
  const longitude = (b.lng - a.lng) * TO_RADIANS;
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(a.lat * TO_RADIANS) *
      Math.cos(b.lat * TO_RADIANS) *
      Math.sin(longitude / 2) ** 2;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped))
  );
}

export function adjacentDistance(point) {
  const group = point.group;
  const index = point.groupIndex;
  if (!group) return 0;
  return (
    (index > 0 ? distanceBetween(group[index - 1], point) : 0) +
    (index + 1 < group.length ? distanceBetween(point, group[index + 1]) : 0)
  );
}
