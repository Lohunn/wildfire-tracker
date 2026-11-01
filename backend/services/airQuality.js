const fetch = require('node-fetch');
const config = require('../config');

const AIRNOW_CURRENT_OBS =
  'https://www.airnowapi.org/aq/observation/latLong/current/';

/**
 * Current-observations AQI for the reporting area nearest (lat, lon).
 * Simplest AirNow option — good default for the app's score calculation.
 */
async function getCurrentAqi(lat, lon) {
  if (!config.airnowApiKey) {
    throw new Error('AIRNOW_API_KEY is not set. Request one at https://docs.airnowapi.org/account/request/');
  }

  const params = new URLSearchParams({
    format: 'application/json',
    latitude: lat,
    longitude: lon,
    distance: '50', // miles to search for a reporting station
    API_KEY: config.airnowApiKey,
  });

  const res = await fetch(`${AIRNOW_CURRENT_OBS}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`AirNow request failed: ${res.status}`);
  }

  const observations = await res.json();
  if (!Array.isArray(observations) || observations.length === 0) {
    return { dataAvailable: false };
  }

  const pm25 = observations.find((o) => o.ParameterName === 'PM2.5');
  const ozone = observations.find((o) => o.ParameterName === 'OZONE');
  const primary = pm25 || observations[0];

  return {
    dataAvailable: true,
    aqi: primary.AQI,
    category: primary.Category?.Name,
    pm25Aqi: pm25?.AQI ?? null,
    ozoneAqi: ozone?.AQI ?? null,
    reportingArea: primary.ReportingArea,
    updatedAt: `${primary.DateObserved}T${String(primary.HourObserved).padStart(2, '0')}:00:00`,
    note: 'AirNow readings are preliminary when first published and may be revised.',
  };
}

module.exports = { getCurrentAqi };
