(() => {
  "use strict";
  const api = (globalThis.GPXEditor = globalThis.GPXEditor || {});

  // Detect pairs of jumps between ORIGINAL adjacent points in each GPX segment.
  // The exit jump is confirmed by at least one following interval strictly <500 m.
  // Never compare the return point to the point preceding the entire excursion.
  function findJumpPoints(groups, distanceBetween, threshold = 500) {
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

  api.findJumpPoints = findJumpPoints;
})();
