const API = '/api';

let map, markersLayer;
let locations = [];
let activeLocationId = null;
let activeEvaluation = null; // last /evaluate response for the active location

// ---------------- Init ----------------

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

async function boot() {
  initMap();
  await checkHealth();
  await loadLocations();
  wireUpUI();
}

async function checkHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    const dot = document.getElementById('healthDot');
    const text = document.getElementById('healthText');
    if (data.firmsKeyConfigured && data.airnowKeyConfigured) {
      dot.className = 'health-dot ok';
      text.textContent = 'All data sources configured';
    } else {
      dot.className = 'health-dot warn';
      const missing = [];
      if (!data.firmsKeyConfigured) missing.push('FIRMS');
      if (!data.airnowKeyConfigured) missing.push('AirNow');
      text.textContent = `Missing keys: ${missing.join(', ')}`;
    }
  } catch {
    document.getElementById('healthText').textContent = 'Backend unreachable';
  }
}

// ---------------- Locations ----------------

async function loadLocations() {
  const res = await fetch(`${API}/locations`);
  locations = await res.json();
  renderLocationList();
}

function renderLocationList() {
  const el = document.getElementById('locationList');
  if (locations.length === 0) {
    el.innerHTML = '<p class="empty-hint">No saved locations yet. Add one to start scanning for nearby heat detections.</p>';
    return;
  }
  el.innerHTML = '';
  for (const loc of locations) {
    const card = document.createElement('div');
    card.className = 'location-card' + (loc.id === activeLocationId ? ' active' : '');
    card.innerHTML = `
      <div class="location-card-text">
        <div class="label">${escapeHtml(loc.label)}</div>
        <div class="address">${escapeHtml(loc.matchedAddress || loc.address)}</div>
      </div>
      <span class="risk-pill none" id="pill-${loc.id}">—</span>
    `;
    card.addEventListener('click', () => selectLocation(loc.id));
    el.appendChild(card);
  }
}

async function selectLocation(id) {
  activeLocationId = id;
  renderLocationList();
  const loc = locations.find((l) => l.id === id);
  document.getElementById('selectedLocationLabel').textContent = loc.label;
  document.getElementById('btnRefresh').disabled = false;
  map.setView([loc.lat, loc.lon], 9);
  await runEvaluation(id);
  await loadAlertsFor(id);
}

async function runEvaluation(id) {
  setDetailLoading();
  try {
    const res = await fetch(`${API}/locations/${id}/evaluate`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Evaluation failed');
    }
    activeEvaluation = await res.json();
    renderMap(activeEvaluation);
    renderClusterList(activeEvaluation);
    updateRiskPill(id, activeEvaluation);
    document.getElementById('disclaimerStrip').textContent = activeEvaluation.disclaimer;
    setupTimeline(activeEvaluation);
    await loadAlertsFor(id); // pick up any newly-created alerts
  } catch (err) {
    document.getElementById('detailEmpty').classList.remove('hidden');
    document.getElementById('detailEmpty').innerHTML = `<p>⚠ ${escapeHtml(err.message)}</p>`;
    document.getElementById('clusterList').innerHTML = '';
  }
}

function setDetailLoading() {
  document.getElementById('detailEmpty').classList.remove('hidden');
  document.getElementById('detailEmpty').innerHTML = '<p>Scanning FIRMS, NWS, and AirNow…</p>';
  document.getElementById('clusterList').innerHTML = '';
}

function updateRiskPill(id, evaluation) {
  const pill = document.getElementById(`pill-${id}`);
  if (!pill) return;
  const inRadius = evaluation.clusters.filter((c) => c.insideAlertRadius);
  if (inRadius.length === 0) {
    pill.textContent = 'clear';
    pill.className = 'risk-pill low';
    return;
  }
  const top = Math.max(...inRadius.map((c) => c.score));
  pill.textContent = top;
  pill.className = 'risk-pill ' + (top >= 60 ? 'high' : top >= 30 ? 'medium' : 'low');
}

// ---------------- Map ----------------

function scoreColor(score) {
  if (score >= 60) return '#ff6b35';
  if (score >= 30) return '#e8a33d';
  return '#4a9d7f';
}

function renderMap(evaluation) {
  markersLayer.clearLayers();

  // Saved location marker
  L.circleMarker([evaluation.location.lat, evaluation.location.lon], {
    radius: 7,
    color: '#f2ede4',
    fillColor: '#f2ede4',
    fillOpacity: 1,
    weight: 2,
  })
    .bindPopup(`<b>${escapeHtml(evaluation.location.label)}</b><br>Saved location`)
    .addTo(markersLayer);

  // Alert radius ring
  L.circle([evaluation.location.lat, evaluation.location.lon], {
    radius: evaluation.location.alertRadiusMiles * 1609.34,
    color: '#948c7d',
    weight: 1,
    dashArray: '4 4',
    fillOpacity: 0.03,
  }).addTo(markersLayer);

  for (const cluster of evaluation.clusters) {
    const marker = L.circleMarker([cluster.centerLat, cluster.centerLon], {
      radius: 6 + Math.min(10, cluster.pointCount),
      color: scoreColor(cluster.score),
      fillColor: scoreColor(cluster.score),
      fillOpacity: 0.55,
      weight: 2,
      className: 'fire-marker',
    });
    marker.bindPopup(popupHtml(cluster));
    marker.on('click', () => scrollToCluster(cluster.id));
    marker.addTo(markersLayer);
  }
}

function popupHtml(cluster) {
  return `
    <b>Score ${cluster.score}${cluster.scoreLimitedData ? ' (limited data)' : ''}</b><br>
    ${cluster.nearestDistanceMiles.toFixed(1)} mi away · ${cluster.pointCount} detection(s)<br>
    Last seen ${timeAgo(cluster.latestDetectedAt)}
    ${cluster.officialIncident ? `<br><i>${escapeHtml(cluster.officialIncident.name)}</i>` : ''}
  `;
}

// ---------------- Cluster detail list + score dial ----------------

function renderClusterList(evaluation) {
  const list = document.getElementById('clusterList');
  const empty = document.getElementById('detailEmpty');
  if (evaluation.clusters.length === 0) {
    empty.classList.remove('hidden');
    empty.innerHTML = '<p>No satellite heat detections found near this location right now.</p>';
    list.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = '';

  for (const cluster of evaluation.clusters) {
    const card = document.createElement('div');
    card.className = 'cluster-card' + (cluster.insideAlertRadius ? ' inside-radius' : '');
    card.id = `cluster-${cluster.id}`;

    const reasonsHtml = cluster.scoreReasons.length
      ? `<ul class="cluster-reasons">${cluster.scoreReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
      : '<p class="cluster-reasons">No standout risk factors — routine detection.</p>';

    card.innerHTML = `
      <div class="cluster-card-head">
        ${scoreDialSvg(cluster.score, cluster.weather?.windDirectionDeg, cluster.weather?.downwindOfFire)}
        <div>
          <div class="cluster-card-title">${cluster.nearestDistanceMiles.toFixed(1)} mi away</div>
          <div class="cluster-card-meta">${cluster.pointCount} detection(s) · ${cluster.satelliteCount} satellite(s) · ${escapeHtml(cluster.highestConfidence)} confidence · last seen ${timeAgo(cluster.latestDetectedAt)}</div>
        </div>
      </div>
      ${reasonsHtml}
      ${cluster.scoreLimitedData ? '<div class="cluster-flags">Limited data — weather or air-quality reading unavailable</div>' : ''}
      ${cluster.officialIncident ? `<div class="incident-tag">Matched: ${escapeHtml(cluster.officialIncident.name)} (${cluster.officialIncident.percentContained ?? '?'}% contained)</div>` : ''}
    `;
    list.appendChild(card);
  }
}

function scrollToCluster(clusterId) {
  const el = document.getElementById(`cluster-${clusterId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Signature visual: a wind-rose dial. The ring fill encodes the score
 * (0-100), and the arrow (when wind data is available) shows which way the
 * wind is blowing — pointed red if that direction is roughly toward the
 * saved location (downwind), gray otherwise. One glyph, three data points.
 */
function scoreDialSvg(score, windDirectionDeg, downwind) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(score);
  const arrow =
    windDirectionDeg != null
      ? `<g transform="rotate(${(windDirectionDeg + 180) % 360} 28 28)">
           <line x1="28" y1="28" x2="28" y2="12" stroke="${downwind ? '#ff6b35' : '#948c7d'}" stroke-width="2" stroke-linecap="round"/>
           <polygon points="28,8 24,15 32,15" fill="${downwind ? '#ff6b35' : '#948c7d'}"/>
         </g>`
      : '';
  return `
    <svg class="score-dial" width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="#3a3327" stroke-width="5"/>
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
        transform="rotate(-90 28 28)"/>
      ${arrow}
      <text x="28" y="32" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="13" fill="#f2ede4">${score}</text>
    </svg>
  `;
}

// ---------------- Timeline ----------------

function setupTimeline(evaluation) {
  const slider = document.getElementById('timelineSlider');
  const timeLabel = document.getElementById('timelineTime');
  slider.disabled = false;
  slider.value = 24;
  timeLabel.textContent = 'now';

  slider.oninput = () => {
    const hoursAgo = 24 - Number(slider.value);
    const cutoff = Date.now() - hoursAgo * 3.6e6;
    timeLabel.textContent = hoursAgo === 0 ? 'now' : `${hoursAgo}h ago`;
    filterMapByTime(evaluation, cutoff);
  };
}

function filterMapByTime(evaluation, cutoffMs) {
  markersLayer.eachLayer((layer) => {
    if (!layer._latlng || layer.options.className !== 'fire-marker') return;
  });
  // Simplest correct approach: redraw markers whose cluster has at least one
  // raw point at or before the cutoff, sized by how many points qualify.
  markersLayer.clearLayers();

  L.circleMarker([evaluation.location.lat, evaluation.location.lon], {
    radius: 7, color: '#f2ede4', fillColor: '#f2ede4', fillOpacity: 1, weight: 2,
  }).addTo(markersLayer);

  for (const cluster of evaluation.clusters) {
    const visiblePoints = cluster.points.filter((p) => new Date(p.acquiredAt).getTime() <= cutoffMs);
    if (visiblePoints.length === 0) continue;
    L.circleMarker([cluster.centerLat, cluster.centerLon], {
      radius: 6 + Math.min(10, visiblePoints.length),
      color: scoreColor(cluster.score),
      fillColor: scoreColor(cluster.score),
      fillOpacity: 0.55,
      weight: 2,
      className: 'fire-marker',
    })
      .bindPopup(popupHtml({ ...cluster, pointCount: visiblePoints.length }))
      .addTo(markersLayer);
  }
}

// ---------------- Alerts ----------------

async function loadAlertsFor(locationId) {
  const res = await fetch(`${API}/locations/${locationId}/alerts`);
  const alerts = await res.json();
  document.getElementById('alertCount').textContent = alerts.length;
  renderAlerts(alerts);
}

function renderAlerts(alerts) {
  const body = document.getElementById('alertsBody');
  if (alerts.length === 0) {
    body.innerHTML = '<p class="empty-hint">No alerts yet.</p>';
    return;
  }
  body.innerHTML = alerts
    .map(
      (a) => `
      <div class="alert-item">
        <div class="alert-reason">${escapeHtml(a.reason)}</div>
        <div class="alert-meta">${escapeHtml(a.approxDistanceMiles)} mi · ${escapeHtml(a.confidence)} confidence · score ${a.score} · ${timeAgo(a.triggeredAt)}</div>
      </div>`
    )
    .join('');
}

// ---------------- Add-location form ----------------

function wireUpUI() {
  const showBtn = document.getElementById('btnShowAdd');
  const form = document.getElementById('addForm');
  const cancelBtn = document.getElementById('btnCancelAdd');
  const errorEl = document.getElementById('addError');

  showBtn.addEventListener('click', () => {
    form.classList.remove('hidden');
    showBtn.classList.add('hidden');
  });
  cancelBtn.addEventListener('click', () => {
    form.classList.add('hidden');
    showBtn.classList.remove('hidden');
    errorEl.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    const label = document.getElementById('fLabel').value.trim();
    const address = document.getElementById('fAddress').value.trim();
    const alertRadiusMiles = Number(document.getElementById('fRadius').value) || 15;

    try {
      const res = await fetch(`${API}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, address, alertRadiusMiles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save location');

      form.reset();
      form.classList.add('hidden');
      showBtn.classList.remove('hidden');
      await loadLocations();
      await selectLocation(data.id);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('btnRefresh').addEventListener('click', () => {
    if (activeLocationId) runEvaluation(activeLocationId);
  });

  document.getElementById('btnAlerts').addEventListener('click', () => {
    document.getElementById('alertsDrawer').classList.remove('hidden');
  });
  document.getElementById('btnCloseAlerts').addEventListener('click', () => {
    document.getElementById('alertsDrawer').classList.add('hidden');
  });
}

// ---------------- Utils ----------------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = diffMs / 3.6e6;
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

boot();
