const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const locationsRouter = require('./routes/locations');
const store = require('./data/store');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/locations', locationsRouter);

app.get('/api/alerts', (req, res) => {
  res.json(store.getAlerts());
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    firmsKeyConfigured: Boolean(config.firmsMapKey),
    airnowKeyConfigured: Boolean(config.airnowApiKey),
  });
});

// Serve the static frontend dashboard.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(config.port, () => {
  console.log(`Wildfire context tracker running on http://localhost:${config.port}`);
  if (!config.firmsMapKey) {
    console.warn('⚠️  FIRMS_MAP_KEY not set — copy .env.example to .env and add your key.');
  }
  if (!config.airnowApiKey) {
    console.warn('⚠️  AIRNOW_API_KEY not set — AQI scoring will report limited data.');
  }
});
