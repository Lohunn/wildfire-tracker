const fetch = require('node-fetch');
const { distanceMiles } = require('./geoMath');

// Public, keyless ArcGIS FeatureServer for current NIFC incident locations.
const WFIGS_INCIDENTS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

// A cluster within this many miles of an official incident point is treated
// as "matched" — close enough that it's very likely the same fire, loose
// enough to allow for reporting lag between the perimeter and the satellite pass.
const MATCH_RADIUS_MILES = 5;

/**
 * Fetches current wildfire incidents from NIFC WFIGS within a bounding area,
 * for matching against FIRMS clusters. Returns [] on any failure so FIRMS
 * detections keep working even when WFIGS is unavailable — not every fire
 * has a filed incident record.
 */
async function fetchNearbyIncidents(lat, lon, radiusMiles = 60) {
  const degPad = radiusMiles / 55; // rough miles-to-degrees at mid latitudes
  const envelope = {
    xmin: lon - degPad,
    ymin: lat - degPad,
    xmax: lon + degPad,
    ymax: lat + degPad,
    spatialReference: { wkid: 4326 },
  };

  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    outFields:
      'IncidentName,IncidentTypeCategory,DailyAcres,PercentContained,POOState,FireDiscoveryDateTime',
    geometry: JSON.stringify(envelope),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
  });

  try {
    const res = await fetch(`${WFIGS_INCIDENTS_URL}?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features) return [];

    return data.features.map((f) => ({
      name: f.attributes.IncidentName,
      type: f.attributes.IncidentTypeCategory, // e.g. WF (wildfire) vs RX (prescribed)
      acres: f.attributes.DailyAcres,
      percentContained: f.attributes.PercentContained,
      state: f.attributes.POOState,
      discoveredAt: f.attributes.FireDiscoveryDateTime,
      lat: f.geometry?.y,
      lon: f.geometry?.x,
    }));
  } catch (err) {
    console.warn('WFIGS fetch failed:', err.message);
    return [];
  }
}

/** Attaches the closest matching official incident (if any) to a cluster. */
function matchClusterToIncident(cluster, incidents) {
  let best = null;
  let bestDist = Infinity;

  for (const incident of incidents) {
    if (incident.lat == null || incident.lon == null) continue;
    const d = distanceMiles(cluster.centerLat, cluster.centerLon, incident.lat, incident.lon);
    if (d <= MATCH_RADIUS_MILES && d < bestDist) {
      best = incident;
      bestDist = d;
    }
  }

  return best ? { ...best, matchDistanceMiles: bestDist } : null;
}

module.exports = { fetchNearbyIncidents, matchClusterToIncident };
