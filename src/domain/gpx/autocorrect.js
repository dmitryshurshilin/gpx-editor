// Detect pairs of jumps between ORIGINAL adjacent points in each GPX segment.
// The exit jump is confirmed by at least one following interval strictly <500 m.
// Never compare the return point to the point preceding the entire excursion.
export function findJumpPoints(groups, distanceBetween, threshold = 500) {
  const rejected = new Set();
  for (const group of groups) {
    let start = -1;
    for (let i = 1; i < group.length; i++) {
      const gap = distanceBetween(group[i - 1], group[i]);
      if (gap <= threshold) continue;
      if (start === -1) {
        start = i;
        continue;
      }
      // group[i] is the first returning point, not part of the rejected range.
      // Without a following point there is no evidence of a stable return.
      if (
        i + 1 < group.length &&
        distanceBetween(group[i], group[i + 1]) < threshold
      ) {
        for (let j = start; j < i; j++) rejected.add(group[j].node);
        start = -1;
      }
    }
    // An unclosed excursion is retained: its end has not been confirmed.
  }
  return rejected;
}

// Describe the original excursion and the connection that deletion would create.
// Coordinates are copied; previewing never mutates GPX nodes or track groups.
export function describeRejectedFragments(groups, rejected) {
  const fragments = [];
  const coordinates = (points) => points.map((point) => [point.lat, point.lng]);
  for (const group of groups) {
    let index = 0;
    while (index < group.length) {
      if (!rejected.has(group[index].node)) {
        index++;
        continue;
      }
      const start = index;
      while (index < group.length && rejected.has(group[index].node)) index++;
      if (start === 0 || index === group.length) continue;
      fragments.push({
        excursion: coordinates(group.slice(start - 1, index + 1)),
        connection: coordinates([group[start - 1], group[index]]),
      });
    }
  }
  return fragments;
}
