/**
 * Computes a 0-100 "context score" for a fire cluster relative to a saved
 * location. This is NOT an official danger rating or a prediction that a
 * fire will reach the location — it's a relative signal for prioritizing
 * which nearby detections deserve a user's attention.
 *
 * Weighting, roughly: distance and recency dominate; confidence, repeat
 * detections, wind, and air quality add or subtract on top of that base.
 */
function scoreCluster(cluster, { weather, airQuality, alertRadiusMiles }) {
  const reasons = [];
  let score = 0;
  let limitedData = false;

  // --- Distance (0-35 pts): closer is worse, scaled against the user's alert radius ---
  const dist = cluster.nearestDistanceMiles;
  const distanceRatio = Math.max(0, 1 - dist / (alertRadiusMiles * 2));
  const distancePts = Math.round(distanceRatio * 35);
  score += distancePts;
  if (dist <= alertRadiusMiles * 0.5) {
    reasons.push(`Detection is close by (~${dist.toFixed(1)} mi away)`);
  }

  // --- Recency (0-30 pts): how long since the latest detection ---
  const ageHours = (Date.now() - new Date(cluster.latestDetectedAt).getTime()) / 3.6e6;
  const recencyRatio = Math.max(0, 1 - ageHours / 48); // fades out over 48h
  const recencyPts = Math.round(recencyRatio * 30);
  score += recencyPts;
  if (ageHours <= 6) {
    reasons.push('Most recent detection was within the last 6 hours');
  }

  // --- Confidence (0-10 pts) ---
  const confidencePts = { high: 10, nominal: 5, low: 2 }[
    String(cluster.highestConfidence).toLowerCase()
  ] ?? 3;
  score += confidencePts;
  if (confidencePts >= 10) reasons.push('Satellite confidence for this detection is high');

  // --- Fire radiative power (0-10 pts): more heat energy = larger/hotter fire ---
  const frpPts = Math.min(10, Math.round((cluster.strongestFrp || 0) / 20));
  score += frpPts;
  if (frpPts >= 6) reasons.push('Detected fire radiative power indicates a strong heat signature');

  // --- Repeated / multi-satellite detections (0-10 pts) ---
  const repeatPts = Math.min(10, (cluster.pointCount - 1) * 2 + (cluster.satelliteCount - 1) * 3);
  score += Math.max(0, repeatPts);
  if (cluster.satelliteCount > 1) {
    reasons.push(`Confirmed by ${cluster.satelliteCount} different satellites`);
  } else if (cluster.pointCount > 1) {
    reasons.push(`${cluster.pointCount} repeated detections in the same area`);
  }

  // --- Wind (0-10 pts) ---
  if (weather?.dataAvailable) {
    if (weather.downwindOfFire) {
      score += 6;
      reasons.push('Saved location is roughly downwind of the fire');
    }
    if (weather.windSpeedKmh != null && weather.windSpeedKmh >= 25) {
      score += 4;
      reasons.push(`Wind speed is elevated (${Math.round(weather.windSpeedKmh)} km/h)`);
    }
  } else {
    limitedData = true;
  }

  // --- Air quality (0-10 pts) ---
  if (airQuality?.dataAvailable) {
    if (airQuality.aqi >= 150) {
      score += 10;
      reasons.push(`Nearby air quality is unhealthy (AQI ${airQuality.aqi})`);
    } else if (airQuality.aqi >= 100) {
      score += 5;
      reasons.push(`Nearby air quality is degraded (AQI ${airQuality.aqi})`);
    }
  } else {
    limitedData = true;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    limitedData,
    reasons,
    breakdown: { distancePts, recencyPts, confidencePts, frpPts, repeatPts },
  };
}

module.exports = { scoreCluster };
