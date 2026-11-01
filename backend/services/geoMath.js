const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two lat/lng points, in kilometers. */
function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  return distanceKm(lat1, lon1, lat2, lon2) * 0.621371;
}

/** Compass bearing (0-360, 0 = north) from point 1 to point 2. */
function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

/**
 * Builds a bounding box [minLon, minLat, maxLon, maxLat] around a center point,
 * padded by radiusKm. Used to build the FIRMS Area API request box.
 */
function boundingBox(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111.32; // ~km per degree latitude
  const lonDelta = radiusKm / (111.32 * Math.cos(toRad(lat)) || 1);
  return {
    minLon: lon - lonDelta,
    minLat: lat - latDelta,
    maxLon: lon + lonDelta,
    maxLat: lat + latDelta,
  };
}

/**
 * How far off-axis the user's location is from the direction the wind is
 * blowing toward, in degrees (0 = directly downwind, 180 = directly upwind).
 */
function angleDifference(a, b) {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

module.exports = { distanceKm, distanceMiles, bearingDeg, boundingBox, angleDifference };
