const config = require('../config');
const { distanceKm } = require('./geoMath');

/**
 * Groups raw FIRMS detections into fire-event clusters. One physical fire can
 * produce several nearby points, and several satellites can each detect it —
 * this merges points that are close in both space and time into a single
 * group so a user doesn't see (or get alerted about) the same fire ten times.
 *
 * Uses simple single-linkage clustering: a point joins a cluster if it's
 * within clusterDistanceKm and clusterTimeWindowHours of ANY point already
 * in that cluster. Good enough at the point-density FIRMS produces; swap for
 * a proper spatial index (e.g. a grid or k-d tree) if scaling to whole-country
 * detection volumes.
 */
function clusterDetections(detections) {
  const clusters = []; // each: { points: [...] }

  for (const point of detections) {
    const pointTime = new Date(point.acquiredAt).getTime();

    let joined = null;
    for (const cluster of clusters) {
      const matches = cluster.points.some((p) => {
        const dKm = distanceKm(p.lat, p.lon, point.lat, point.lon);
        const dHours = Math.abs(pointTime - new Date(p.acquiredAt).getTime()) / 3.6e6;
        return dKm <= config.clusterDistanceKm && dHours <= config.clusterTimeWindowHours;
      });
      if (matches) {
        joined = cluster;
        break;
      }
    }

    if (joined) {
      joined.points.push(point);
    } else {
      clusters.push({ points: [point] });
    }
  }

  return clusters.map((cluster, idx) => summarizeCluster(cluster.points, idx));
}

const CONFIDENCE_RANK = { low: 0, l: 0, nominal: 1, n: 1, high: 2, h: 2 };

function summarizeCluster(points, idx) {
  const sortedByTime = [...points].sort(
    (a, b) => new Date(a.acquiredAt) - new Date(b.acquiredAt)
  );
  const first = sortedByTime[0];
  const latest = sortedByTime[sortedByTime.length - 1];

  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLon = points.reduce((s, p) => s + p.lon, 0) / points.length;

  const highestConfidence = points.reduce((best, p) => {
    const rank = CONFIDENCE_RANK[String(p.confidence).toLowerCase()] ?? 0;
    const bestRank = CONFIDENCE_RANK[String(best).toLowerCase()] ?? 0;
    return rank > bestRank ? p.confidence : best;
  }, points[0].confidence);

  const strongestFrp = Math.max(...points.map((p) => p.frp || 0));
  const satellites = [...new Set(points.map((p) => p.satellite))];
  const sources = [...new Set(points.map((p) => p.source))];
  const nearestDistanceMiles = Math.min(...points.map((p) => p.distanceMiles));

  return {
    id: `cluster-${idx}-${first.acquiredAt}`,
    centerLat,
    centerLon,
    pointCount: points.length,
    satelliteCount: satellites.length,
    satellites,
    sources,
    firstDetectedAt: first.acquiredAt,
    latestDetectedAt: latest.acquiredAt,
    highestConfidence,
    strongestFrp,
    nearestDistanceMiles,
    points, // raw points kept for the 24-hour timeline replay
  };
}

module.exports = { clusterDetections };
