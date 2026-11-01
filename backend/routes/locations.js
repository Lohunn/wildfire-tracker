const express = require('express');
const config = require('../config');
const store = require('../data/store');
const { geocodeAddress } = require('../services/geocode');
const { evaluateLocation } = require('../services/pipeline');

const router = express.Router();

// POST /api/locations  { label, address, alertRadiusMiles? }
router.post('/', async (req, res) => {
  try {
    const { label, address, alertRadiusMiles } = req.body;
    if (!label || !address) {
      return res.status(400).json({ error: 'label and address are required' });
    }

    const geo = await geocodeAddress(address);
    const location = store.addLocation({
      label,
      address,
      matchedAddress: geo.matchedAddress,
      lat: geo.lat,
      lon: geo.lon,
      alertRadiusMiles: alertRadiusMiles || config.defaultAlertRadiusMiles,
    });

    res.status(201).json(location);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// GET /api/locations
router.get('/', (req, res) => {
  res.json(store.getLocations());
});

// DELETE /api/locations/:id
router.delete('/:id', (req, res) => {
  store.deleteLocation(req.params.id);
  res.status(204).end();
});

// GET /api/locations/:id/evaluate  — runs the full pipeline and returns
// clusters + score + any newly-triggered alerts for this location.
router.get('/:id/evaluate', async (req, res) => {
  const location = store.getLocation(req.params.id);
  if (!location) return res.status(404).json({ error: 'Location not found' });

  try {
    const result = await evaluateLocation(location);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Pipeline failed: ${err.message}` });
  }
});

// GET /api/locations/:id/alerts — alert history for one location
router.get('/:id/alerts', (req, res) => {
  res.json(store.getAlerts(req.params.id));
});

module.exports = router;
