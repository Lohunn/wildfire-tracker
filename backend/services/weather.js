const fetch = require('node-fetch');
const config = require('../config');
const { bearingDeg, angleDifference } = require('./geoMath');

const headers = { 'User-Agent': config.nwsUserAgent, Accept: 'application/geo+json' };

/**
 * Reads the first value in an NWS gridpoint time-series whose validTime
 * window contains `atTime` (falls back to the most recent value before it).
 * NWS grid values come back as { validTime: "2026-08-09T18:00:00+00:00/PT1H", value }.
 */
function valueAt(series, atTime) {
  if (!series || series.length === 0) return null;
  const target = new Date(atTime).getTime();

  let best = null;
  for (const entry of series) {
    const start = new Date(entry.validTime.split('/')[0]).getTime();
    if (start <= target && (best === null || start > best.start)) {
      best = { start, value: entry.value, updatedAt: entry.validTime.split('/')[0] };
    }
  }
  return best;
}

/**
 * Fetches wind speed, wind direction, and relative humidity for a point at a
 * given time, then works out whether `userLat/userLon` is roughly downwind
 * of that point.
 */
async function getWeatherContext(lat, lon, atTime, userLat, userLon) {
  const pointRes = await fetch(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    { headers }
  );
  if (!pointRes.ok) {
    throw new Error(`NWS /points lookup failed: ${pointRes.status}`);
  }
  const pointData = await pointRes.json();
  const gridUrl = pointData.properties.forecastGridData;

  const gridRes = await fetch(gridUrl, { headers });
  if (!gridRes.ok) {
    throw new Error(`NWS forecastGridData fetch failed: ${gridRes.status}`);
  }
  const grid = await gridRes.json();
  const props = grid.properties;

  const windSpeed = valueAt(props.windSpeed?.values, atTime); // km/h
  const windDirection = valueAt(props.windDirection?.values, atTime); // degrees, FROM
  const humidity = valueAt(props.relativeHumidity?.values, atTime); // %

  let downwind = null;
  if (windDirection?.value != null) {
    const windTravelingToward = (windDirection.value + 180) % 360;
    const bearingToUser = bearingDeg(lat, lon, userLat, userLon);
    const offAxisDeg = angleDifference(windTravelingToward, bearingToUser);
    // Within a 45-degree cone of "straight at the user" counts as downwind.
    downwind = offAxisDeg <= 45;
  }

  return {
    windSpeedKmh: windSpeed?.value ?? null,
    windDirectionDeg: windDirection?.value ?? null,
    relativeHumidityPct: humidity?.value ?? null,
    downwindOfFire: downwind,
    updatedAt: windSpeed?.updatedAt || windDirection?.updatedAt || null,
    dataAvailable: windSpeed != null || windDirection != null || humidity != null,
  };
}

module.exports = { getWeatherContext };
