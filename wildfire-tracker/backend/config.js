require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  firmsMapKey: process.env.FIRMS_MAP_KEY || '',
  airnowApiKey: process.env.AIRNOW_API_KEY || '',
  nwsUserAgent: process.env.NWS_USER_AGENT || 'wildfire-context-tracker (set NWS_USER_AGENT in .env)',

  // VIIRS near-real-time feeds FIRMS exposes. Start with one, or combine all three
  // for more frequent passes over the same area.
  firmsSources: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'],

  // How many days back the FIRMS Area API should look (1-10, spec calls for 1-5).
  firmsDayRange: 2,

  // Clustering: detections within this distance and time window are treated as
  // the same fire event rather than separate points.
  clusterDistanceKm: 2,
  clusterTimeWindowHours: 12,

  // A saved location's default watch radius if the user doesn't set one, in miles.
  defaultAlertRadiusMiles: 15,

  // Minimum score jump (0-100 scale) that re-triggers an alert for a fire the
  // user has already been notified about.
  scoreIncreaseAlertThreshold: 15,
};
