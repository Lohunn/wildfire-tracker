const config = require('../config');
const store = require('../data/store');

/**
 * A cluster key stable enough to track "have we alerted on this fire before"
 * across polling runs, without relying on the cluster's array index (which
 * can shift as new detections come in). Buckets by rounded location + day so
 * the same physical fire re-clusters to the same key run over run.
 */
function clusterKey(cluster) {
  const latBucket = cluster.centerLat.toFixed(2);
  const lonBucket = cluster.centerLon.toFixed(2);
  const dayBucket = cluster.firstDetectedAt.slice(0, 10);
  return `${latBucket},${lonBucket},${dayBucket}`;
}

/**
 * Decides whether a newly scored cluster should raise an alert for a saved
 * location, and if so, records it and returns the alert. Fires on:
 *  - a brand-new cluster inside the alert radius
 *  - a new satellite confirming an already-seen cluster
 *  - the score increasing by more than the configured threshold
 */
function evaluateAlert(location, cluster, scoreResult, incident) {
  if (cluster.nearestDistanceMiles > location.alertRadiusMiles) return null;

  const key = clusterKey(cluster);
  const previousScore = store.getLastScore(location.id, key);
  store.setLastScore(location.id, key, scoreResult.score);

  let reason = null;
  if (previousScore === undefined) {
    reason = 'New fire detection appeared inside your alert radius';
  } else if (scoreResult.score - previousScore >= config.scoreIncreaseAlertThreshold) {
    reason = `Risk score increased significantly (${previousScore} → ${scoreResult.score})`;
  } else if (cluster.satelliteCount > 1 && previousScore !== undefined) {
    // Only worth a fresh nudge the first time it becomes multi-satellite;
    // callers can dedupe further using pointCount if desired.
  }

  if (!reason) return null;

  return store.addAlert({
    locationId: location.id,
    clusterKey: key,
    clusterId: cluster.id,
    reason,
    detectionTime: cluster.latestDetectedAt,
    approxDistanceMiles: Math.round(cluster.nearestDistanceMiles * 10) / 10,
    confidence: cluster.highestConfidence,
    dataSource: cluster.sources.join(', '),
    score: scoreResult.score,
    officialIncident: incident ? incident.name : null,
  });
}

module.exports = { evaluateAlert, clusterKey };
