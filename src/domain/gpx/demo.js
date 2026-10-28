export function createDemoGPX() {
  const coordinates = Array.from({ length: 110 }, (_, i) => {
    const t = (i / 109) * Math.PI * 1.75;
    return [53.225 + Math.sin(t) * 0.019, 50.16 + Math.cos(t) * 0.035];
  });
  coordinates.splice(51, 0, [53.59, 50.91], [53.61, 50.94], [53.6, 50.96]);
  const points = coordinates
    .map(
      ([lat, lon], i) =>
        `  <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>80</ele><time>${new Date(Date.UTC(2026, 9, 21, 7, i)).toISOString()}</time></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GPX Editor" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Прогулка по Самаре</name></metadata><trk><name>Демонстрационный трек с GPS-выбросом</name><trkseg>\n${points}\n</trkseg></trk></gpx>`;
}
