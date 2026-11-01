/* ═══════════════════════════════════════════════════════════════════
   EMBER — Wildfire Context Tracker
   Frontend application logic with Motion design system
   ═══════════════════════════════════════════════════════════════════ */

const API = '/api';

let map, markersLayer;
let locations = [];
let activeLocationId = null;
let activeEvaluation = null;

// ═══════════════════════════════════════════════════════════════════
// FIRE CANVAS — animated procedural fire on the hero section
// ═══════════════════════════════════════════════════════════════════

function initFireCanvas() {
  const canvas = document.getElementById('fireCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w, h;
  const particles = [];
  const PARTICLE_COUNT = 120;

  function resize() {
    w = canvas.width = canvas.parentElement.offsetWidth;
    h = canvas.height = canvas.parentElement.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() { this.reset(); }

    reset() {
      this.x = w * 0.3 + Math.random() * w * 0.4;
      this.y = h + Math.random() * 20;
      this.vx = (Math.random() - 0.5) * 1.2;
      this.vy = -(1.5 + Math.random() * 3);
      this.radius = 2 + Math.random() * 4;
      this.life = 0;
      this.maxLife = 60 + Math.random() * 80;

      // Color: warm amber/yellow palette matching --primary and --tertiary
      const t = Math.random();
      if (t < 0.3) {
        this.color = { r: 251, g: 213, b: 9 };    // #FBD509 primary
      } else if (t < 0.6) {
        this.color = { r: 255, g: 219, b: 42 };    // #FFDB2A tertiary
      } else if (t < 0.8) {
        this.color = { r: 255, g: 160, b: 20 };    // warm orange
      } else {
        this.color = { r: 255, g: 100, b: 30 };    // deep ember
      }
    }

    update() {
      this.life++;
      this.x += this.vx + (Math.random() - 0.5) * 0.5;
      this.y += this.vy;
      this.vy *= 0.995;
      this.vx *= 0.99;
      this.radius *= 0.997;

      if (this.life > this.maxLife || this.y < -20 || this.radius < 0.3) {
        this.reset();
      }
    }

    draw(ctx) {
      const progress = this.life / this.maxLife;
      const alpha = Math.sin(progress * Math.PI) * 0.6;
      const { r, g, b } = this.color;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();

      // Glow
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.radius * 3
      );
      gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.3})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = new Particle();
    p.life = Math.floor(Math.random() * p.maxLife);
    p.y = h - (p.life / p.maxLife) * h;
    particles.push(p);
  }

  // Bottom glow gradient (static)
  function drawBaseGlow() {
    const gradient = ctx.createLinearGradient(0, h, 0, h * 0.4);
    gradient.addColorStop(0, 'rgba(251,213,9,0.08)');
    gradient.addColorStop(0.3, 'rgba(255,160,20,0.03)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  let animId;
  function animate() {
    ctx.clearRect(0, 0, w, h);
    drawBaseGlow();
    for (const p of particles) {
      p.update();
      p.draw(ctx);
    }
    animId = requestAnimationFrame(animate);
  }

  // Only animate when hero is visible
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      if (!animId) animate();
    } else {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }, { threshold: 0.1 });
  observer.observe(canvas.parentElement);

  animate();
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION — Hero ↔ App transitions
// ═══════════════════════════════════════════════════════════════════

function showApp() {
  document.getElementById('heroSection').style.display = 'none';
  document.getElementById('howSection').style.display = 'none';
  document.getElementById('appSection').classList.add('active');
  if (map) map.invalidateSize();
}

function showHero() {
  document.getElementById('heroSection').style.display = '';
  document.getElementById('howSection').style.display = '';
  document.getElementById('appSection').classList.remove('active');
}

// ═══════════════════════════════════════════════════════════════════
// MAP INIT
// ═══════════════════════════════════════════════════════════════════

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    className: 'dark-tiles',
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

// ═══════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════

async function boot() {
  initFireCanvas();
  wireUpNavigation();

  // Defer map init until the app section is shown
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

// ═══════════════════════════════════════════════════════════════════
// LOCATIONS
// ═══════════════════════════════════════════════════════════════════

async function loadLocations() {
  try {
    const res = await fetch(`${API}/locations`);
    locations = await res.json();
    renderLocationList();
  } catch {
    // Backend may not be running yet — don't crash
  }
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
    await loadAlertsFor(id);
  } catch (err) {
    document.getElementById('detailEmpty').classList.remove('hidden');
    document.getElementById('detailEmpty').innerHTML = `<p>⚠ ${escapeHtml(err.message)}</p>`;
    document.getElementById('clusterList').innerHTML = '';
  }
}

function setDetailLoading() {
  const empty = document.getElementById('detailEmpty');
  empty.classList.remove('hidden');
  empty.innerHTML = '<p class="loading-pulse">Scanning FIRMS, NWS, and AirNow…</p>';
  document.getElementById('clusterList').innerHTML = '';
}

function updateRiskPill(id, evaluation) {
  const pill = document.getElementById(`pill-${id}`);
  if (!pill) return;
  const inRadius = evaluation.clusters.filter((c) => c.insideAlertRadius);
  if (inRadius.length === 0) {
    pill.textContent = 'CLEAR';
    pill.className = 'risk-pill low';
    return;
  }
  const top = Math.max(...inRadius.map((c) => c.score));
  pill.textContent = top;
  pill.className = 'risk-pill ' + (top >= 60 ? 'high' : top >= 30 ? 'medium' : 'low');
}

// ═══════════════════════════════════════════════════════════════════
// MAP RENDERING
// ═══════════════════════════════════════════════════════════════════

function scoreColor(score) {
  if (score >= 60) return '#FF4945'; // --error / high risk
  if (score >= 30) return '#FBD509'; // --primary / medium
  return '#52CD86';                  // --success / low
}

function renderMap(evaluation) {
  markersLayer.clearLayers();

  // Saved location marker
  L.circleMarker([evaluation.location.lat, evaluation.location.lon], {
    radius: 7,
    color: '#EDEBE5',
    fillColor: '#EDEBE5',
    fillOpacity: 1,
    weight: 2,
  })
    .bindPopup(`<b>${escapeHtml(evaluation.location.label)}</b><br>Saved location`)
    .addTo(markersLayer);

  // Alert radius ring
  L.circle([evaluation.location.lat, evaluation.location.lon], {
    radius: evaluation.location.alertRadiusMiles * 1609.34,
    color: '#979D97',
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

// ═══════════════════════════════════════════════════════════════════
// CLUSTER DETAIL LIST & SCORE DIAL
// ═══════════════════════════════════════════════════════════════════

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
      ${cluster.scoreLimitedData ? '<div class="cluster-flags">LIMITED DATA — WEATHER OR AIR-QUALITY READING UNAVAILABLE</div>' : ''}
      ${cluster.officialIncident ? `<div class="incident-tag">MATCHED: ${escapeHtml(cluster.officialIncident.name)} (${cluster.officialIncident.percentContained ?? '?'}% CONTAINED)</div>` : ''}
    `;
    list.appendChild(card);
  }
}

function scrollToCluster(clusterId) {
  const el = document.getElementById(`cluster-${clusterId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Score dial SVG — ring fill encodes 0-100, arrow shows wind direction.
 * Colors use the Motion design system tokens.
 */
function scoreDialSvg(score, windDirectionDeg, downwind) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(score);
  const arrowColor = downwind ? '#FF4945' : '#979D97';
  const arrow =
    windDirectionDeg != null
      ? `<g transform="rotate(${(windDirectionDeg + 180) % 360} 28 28)">
           <line x1="28" y1="28" x2="28" y2="12" stroke="${arrowColor}" stroke-width="2" stroke-linecap="round"/>
           <polygon points="28,8 24,15 32,15" fill="${arrowColor}"/>
         </g>`
      : '';
  return `
    <svg class="score-dial" width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="#343034" stroke-width="5"/>
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
        transform="rotate(-90 28 28)"/>
      ${arrow}
      <text x="28" y="32" text-anchor="middle" font-family="Geist Mono, monospace" font-size="13" fill="#EDEBE5">${score}</text>
    </svg>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════════════════════════════

function setupTimeline(evaluation) {
  const slider = document.getElementById('timelineSlider');
  const timeLabel = document.getElementById('timelineTime');
  slider.disabled = false;
  slider.value = 24;
  timeLabel.textContent = 'NOW';

  slider.oninput = () => {
    const hoursAgo = 24 - Number(slider.value);
    const cutoff = Date.now() - hoursAgo * 3.6e6;
    timeLabel.textContent = hoursAgo === 0 ? 'NOW' : `${hoursAgo}H AGO`;
    filterMapByTime(evaluation, cutoff);
  };
}

function filterMapByTime(evaluation, cutoffMs) {
  markersLayer.clearLayers();

  L.circleMarker([evaluation.location.lat, evaluation.location.lon], {
    radius: 7, color: '#EDEBE5', fillColor: '#EDEBE5', fillOpacity: 1, weight: 2,
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

// ═══════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════

async function loadAlertsFor(locationId) {
  try {
    const res = await fetch(`${API}/locations/${locationId}/alerts`);
    const alerts = await res.json();
    document.getElementById('alertCount').textContent = alerts.length;
    renderAlerts(alerts);
  } catch {
    // non-critical
  }
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
        <div class="alert-meta">${escapeHtml(a.approxDistanceMiles)} MI · ${escapeHtml(a.confidence)} CONFIDENCE · SCORE ${a.score} · ${timeAgo(a.triggeredAt)}</div>
      </div>`
    )
    .join('');
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION WIRING
// ═══════════════════════════════════════════════════════════════════

function wireUpNavigation() {
  // Hero → App
  const launchBtns = [
    document.getElementById('heroLaunchBtn'),
    document.getElementById('heroStartBtn'),
  ];
  launchBtns.forEach((btn) => {
    if (btn) btn.addEventListener('click', () => {
      showApp();
      if (!map) initMap();
    });
  });

  // "How it works" button scrolls to that section
  const learnBtn = document.getElementById('heroLearnBtn');
  if (learnBtn) learnBtn.addEventListener('click', () => {
    document.getElementById('howSection').scrollIntoView({ behavior: 'smooth' });
  });

  // App → Hero
  const backBtn = document.getElementById('btnBackToHero');
  if (backBtn) backBtn.addEventListener('click', showHero);
}

// ═══════════════════════════════════════════════════════════════════
// ADD-LOCATION FORM & UI WIRING
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// GO
// ═══════════════════════════════════════════════════════════════════

boot();

