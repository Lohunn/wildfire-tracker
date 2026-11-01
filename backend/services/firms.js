const fetch = require('node-fetch');
const config = require('../config');
const { boundingBox, distanceMiles } = require('./geoMath');

const FIRMS_AREA_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

/**
 * Parses the CSV FIRMS returns into an array of detection objects.
 * FIRMS VIIRS columns: latitude,longitude,bright_ti4,scan,track,acq_date,
 * acq_time,satellite,confidence,version,bright_ti5,frp,daynight
 */
function parseCsv(csvText, source) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1);

  return rows
    .map((line) => {
      const cols = line.split(',');
      const row = {};
      headers.forEach((h, i) => (row[h] = cols[i]));

      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

      // acq_date is YYYY-MM-DD, acq_time is HHMM (UTC). Combine into an ISO string.
      const time = String(row.acq_time || '0000').padStart(4, '0');
      const acquiredAt = `${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`;

      // VIIRS confidence is "l" (low), "n" (nominal), or "h" (high).
      const confidenceMap = { l: 'low', n: 'nominal', h: 'high' };

      return {
        id: `${source}-${lat}-${lon}-${row.acq_date}-${time}`,
        source,
        satellite: row.satellite,
        lat,
        lon,
        acquiredAt,
        confidence: confidenceMap[String(row.confidence).toLowerCase()] || row.confidence,
        frp: parseFloat(row.frp) || 0, // fire radiative power, MW
        dayNight: row.daynight,
      };
    })
    .filter(Boolean);
}

/**
 * Fetches raw VIIRS detections inside a box around (lat, lon) for the
 * configured day range, across all configured FIRMS sources.
 */
async function fetchDetectionsNear(lat, lon, radiusKm) {
  if (!config.firmsMapKey) {
    throw new Error('FIRMS_MAP_KEY is not set. Get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/');
  }

  const box = boundingBox(lat, lon, radiusKm);
  const bboxStr = `${box.minLon},${box.minLat},${box.maxLon},${box.maxLat}`;

  const allDetections = [];

  for (const source of config.firmsSources) {
    const url = `${FIRMS_AREA_BASE}/${config.firmsMapKey}/${source}/${bboxStr}/${config.firmsDayRange}`;
    const res = await fetch(url);
    if (!res.ok) {
      // One feed failing (e.g. a satellite temporarily offline) shouldn't kill the request.
      console.warn(`FIRMS fetch failed for ${source}: ${res.status}`);
      continue;
    }
    const text = await res.text();
    // FIRMS returns a plain-text error message instead of CSV on bad keys/params.
    if (!text.includes('latitude')) {
      console.warn(`FIRMS ${source} returned no data: ${text.slice(0, 120)}`);
      continue;
    }
    allDetections.push(...parseCsv(text, source));
  }

  // Attach exact distance from the saved location to each raw point.
  return allDetections.map((d) => ({
    ...d,
    distanceMiles: distanceMiles(lat, lon, d.lat, d.lon),
  }));
}

module.exports = { fetchDetectionsNear, parseCsv };
