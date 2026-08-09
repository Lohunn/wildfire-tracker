const fetch = require('node-fetch');

const CENSUS_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

/**
 * Converts a US address string into { lat, lon, matchedAddress }.
 * Uses the free US Census Geocoder — no API key required.
 * Throws if the address can't be matched.
 */
async function geocodeAddress(address) {
  const params = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    format: 'json',
  });

  const res = await fetch(`${CENSUS_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Census geocoder request failed: ${res.status}`);
  }

  const data = await res.json();
  const matches = data?.result?.addressMatches;
  if (!matches || matches.length === 0) {
    throw new Error(`Could not geocode address: "${address}"`);
  }

  const best = matches[0];
  return {
    lat: parseFloat(best.coordinates.y),
    lon: parseFloat(best.coordinates.x),
    matchedAddress: best.matchedAddress,
  };
}

module.exports = { geocodeAddress };
