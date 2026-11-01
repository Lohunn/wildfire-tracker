# Ember — Wildfire Context Tracker

Tracks NASA satellite wildfire heat detections near places you care about
(home, college, a family member's address), enriches each nearby fire with
live weather and air-quality context, scores how much attention it deserves,
and alerts you when something changes.

This is an informational tool, not an evacuation system. It says "here's
what nearby satellites and sensors are showing and why," not "a fire is
coming for you."

## UI Design

The interface follows the **Motion Design System** (`DESIGN.md`) — a dark
theme built on Near Black (#080808) with Vivid Amber (#FBD509) accents,
TASA Orbiter typography, and pill-shaped controls.

The landing page features an **animated procedural fire** rendered on a
`<canvas>` element, a "How it works" pipeline breakdown, and a one-click
transition into the full tracker dashboard with map, score dials, 24h
timeline, and alert drawer.

## How it works (pipeline)

```
saved address
   │  US Census Geocoder (free, no key)
   ▼
lat/lon ──► NASA FIRMS Area API (VIIRS, 3 satellites) ──► raw heat detections
   │                                                            │
   │                                                    cluster nearby/simultaneous
   │                                                    points into fire "events"
   │                                                            ▼
   │                                                     enrich each cluster:
   ├──────────────────────────────────────────────► NWS  (wind, humidity, downwind check)
   ├──────────────────────────────────────────────► AirNow (AQI near the saved location)
   └──────────────────────────────────────────────► NIFC WFIGS (official incident match)
                                                               │
                                                               ▼
                                                     score (0-100) + plain-English reasons
                                                               │
                                                               ▼
                                               alert if new / re-confirmed / score jumped
```

## Project layout

```
DESIGN.md                      Motion Design System tokens & rules
backend/
  server.js                    Express app entry point
  config.js                    Tunable constants (radii, thresholds, FIRMS sources)
  services/
    geoMath.js                 Distance, bearing, bounding-box math
    geocode.js                 Census Geocoder client
    firms.js                   NASA FIRMS Area API client + CSV parser
    clustering.js              Groups raw detections into fire-event clusters
    weather.js                 NWS client, wind-direction downwind check
    airQuality.js              EPA AirNow current-observations client
    wfigs.js                   NIFC official-incident matching
    scoring.js                 0-100 context score + explanation strings
    alerts.js                  Alert-trigger rules + dedupe
    pipeline.js                Orchestrates the full flow per location
  routes/locations.js          REST API (add/list/delete/evaluate/alerts)
  data/store.js                In-memory store (swap for a real DB later)
frontend/
  index.html                   Landing page (hero + pipeline) & tracker dashboard
  style.css                    Motion Design System implementation
  app.js                       Fire canvas animation, map, score dials, alerts
```

## Running it

```bash
cd backend
cp .env.example .env     # add your free FIRMS_MAP_KEY and AIRNOW_API_KEY
npm install
npm start
```

Then open http://localhost:4000 — the backend also serves the frontend
dashboard as static files, so there's nothing separate to run.

Get free keys:
- FIRMS: https://firms.modaps.eosdis.nasa.gov/api/map_key/
- AirNow: https://docs.airnowapi.org/account/request/
- NWS needs no key, just a descriptive User-Agent (set in `.env`)

## Design choices worth mentioning

- **Clustering before scoring.** One physical fire produces multiple VIIRS
  pixels and can be seen by all three satellites in a single day. Scoring
  raw points would spam the user with duplicates, so points are grouped by
  proximity + time first (`services/clustering.js`), and everything downstream
  operates on clusters.
- **Score is explainable, not a black box.** `scoring.js` returns the reasons
  behind a number, not just the number — distance and recency dominate the
  weighting, matching how a person would actually reason about a nearby fire.
- **Missing data is flagged, not zeroed.** If NWS or AirNow can't be reached,
  the score is marked `limited data` instead of silently scoring that factor
  as "no risk," which would understate danger during an outage.
- **Alerts are deduplicated across polling runs**, keyed by a rounded
  lat/lon + day bucket, so the same fire doesn't re-trigger a notification
  every time the pipeline re-runs — only on a new cluster, a new satellite
  confirming it, or a meaningful score jump.
- **Motion Design System.** The interface follows a measured dark design
  system with TASA Orbiter type, amber accents, and quick transitions.
  See `DESIGN.md` for all tokens and rules.

## Known limitations (also surfaced in the UI)

- A FIRMS point is a satellite-detected heat anomaly, not a confirmed
  wildfire — it can be a prescribed burn, flare, or other heat source.
- Point count is not a proxy for acreage burned.
- Weather is per gridpoint/area, not the exact fire location; AirNow monitors
  can be miles from where the smoke actually is, and their readings are
  preliminary when first published.
- The in-memory store resets on server restart — intentional for a
  portfolio build; swap `data/store.js` for Postgres/Mongo to persist.
- No auth/multi-user support yet — everything is a single shared list of
  locations, which is fine for a demo but would need user accounts for
  real deployment.

## Possible next steps

- Persist to a real database and add scheduled background polling (cron)
  instead of on-demand `/evaluate` calls, so alerts fire even when no one
  has the dashboard open.
- Push notifications (web push / SMS / email) instead of the in-app alert
  drawer.
- Swap the in-memory clustering for a spatial index if watching many
  locations at national scale.
- Add an ML model for fire spread prediction based on historical FIRMS
  data, terrain, and weather patterns.

