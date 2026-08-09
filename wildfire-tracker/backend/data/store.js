/**
 * Minimal in-memory store so the app runs with zero setup. Every collection
 * below maps 1:1 to a table/collection you'd create in a real database —
 * swap this file for a Postgres/Mongo layer without touching the routes or
 * services, as long as you keep the same method signatures.
 */

let locations = []; // { id, label, address, lat, lon, alertRadiusMiles, createdAt }
let clusterHistory = new Map(); // locationId -> Map(clusterKey -> lastKnownScore) for re-alert diffing
let alerts = []; // { id, locationId, clusterId, triggeredAt, reason, ...detectionSummary }
let nextId = 1;

function addLocation(loc) {
  const record = { id: String(nextId++), createdAt: new Date().toISOString(), ...loc };
  locations.push(record);
  clusterHistory.set(record.id, new Map());
  return record;
}

function getLocations() {
  return locations;
}

function getLocation(id) {
  return locations.find((l) => l.id === id);
}

function deleteLocation(id) {
  locations = locations.filter((l) => l.id !== id);
  clusterHistory.delete(id);
}

function getLastScore(locationId, clusterKey) {
  return clusterHistory.get(locationId)?.get(clusterKey);
}

function setLastScore(locationId, clusterKey, score) {
  if (!clusterHistory.has(locationId)) clusterHistory.set(locationId, new Map());
  clusterHistory.get(locationId).set(clusterKey, score);
}

function addAlert(alert) {
  const record = { id: String(nextId++), triggeredAt: new Date().toISOString(), ...alert };
  alerts.unshift(record);
  return record;
}

function getAlerts(locationId) {
  return locationId ? alerts.filter((a) => a.locationId === locationId) : alerts;
}

module.exports = {
  addLocation,
  getLocations,
  getLocation,
  deleteLocation,
  getLastScore,
  setLastScore,
  addAlert,
  getAlerts,
};
