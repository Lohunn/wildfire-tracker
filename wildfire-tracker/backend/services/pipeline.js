const config = require('../config');
const { fetchDetectionsNear } = require('./firms');
const { clusterDetections } = require('./clustering');
const { getWeatherContext } = require('./weather');
const { getCurrentAqi } = require('./airQuality');
const { fetchNearbyIncidents, matchClusterToIncident } = require('./wfigs');
const { scoreCluster } = require('./scoring');
const { evaluateAlert } = require('./alerts');

/**
 * Runs the full detect -> cluster -> enrich -> score -> alert pipeline for
 * one saved location. Returns everything the frontend needs to render the
 * map, the cluster list, and the 24-hour timeline in one response.
 */
async function evaluateLocation(location) {
  // Search radius: enough beyond the alert radius to catch fires that are
  // currently just outside it (useful context, and lets score increases
  // reflect a fire moving closer before it crosses the threshold).
  const searchRadiusKm = (location.alertRadiusMiles + 10) * 1.60934;

  const rawDetections = await fetchDetectionsNear(location.lat, location.lon, searchRadiusKm);
  const clusters = clusterDetections(rawDetections);

  const incidents = await fetchNearbyIncidents(location.lat, location.lon).catch(() => []);

  const enrichedClusters = [];
  const newAlerts = [];

  for (const cluster of clusters) {
    const [weatherResult, aqiResult] = await Promise.allSettled([
      getWeatherContext(cluster.centerLat, cluster.centerLon, cluster.latestDetectedAt, location.lat, location.lon),
      getCurrentAqi(location.lat, location.lon),
    ]);

    const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : { dataAvailable: false };
    const airQuality = aqiResult.status === 'fulfilled' ? aqiResult.value : { dataAvailable: false };
    const incident = matchClusterToIncident(cluster, incidents);

    const scoreResult = scoreCluster(cluster, {
      weather,
      airQuality,
      alertRadiusMiles: location.alertRadiusMiles,
    });

    const alert = evaluateAlert(location, cluster, scoreResult, incident);
    if (alert) newAlerts.push(alert);

    enrichedClusters.push({
      ...cluster,
      weather,
      airQuality,
      officialIncident: incident,
      score: scoreResult.score,
      scoreLimitedData: scoreResult.limitedData,
      scoreReasons: scoreResult.reasons,
      insideAlertRadius: cluster.nearestDistanceMiles <= location.alertRadiusMiles,
    });
  }

  // Sort so the highest-priority fires surface first.
  enrichedClusters.sort((a, b) => b.score - a.score);

  return {
    location,
    generatedAt: new Date().toISOString(),
    clusters: enrichedClusters,
    newAlerts,
    disclaimer:
      'This score is contextual information only, not an official wildfire danger rating or evacuation guidance. FIRMS points are satellite heat anomalies, not confirmed fire perimeters.',
  };
}

module.exports = { evaluateLocation };
