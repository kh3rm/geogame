import { APP_VERSION, DEFAULT_CENTER, DEFAULT_SPAWNS, TILE_LAYER } from './config.js';
import { CREATURES, getCreature } from './creatures.js';
import { getAll, saveCustomSpawn, clear } from './db.js';
import { distanceMeters, formatDistance, signalFromDistance, randomOffsetLatLng } from './geo.js';
import { EncounterController } from './encounter.js';

const $ = (id) => document.getElementById(id);

const els = {
  map: $('map'),
  statusPill: $('statusPill'),
  nearestName: $('nearestName'),
  nearestDetails: $('nearestDetails'),
  signalBadge: $('signalBadge'),
  signalBar: $('signalBar'),
  encounterBtn: $('encounterBtn'),
  locateBtn: $('locateBtn'),
  spawnHereBtn: $('spawnHereBtn'),
  simulateBtn: $('simulateBtn'),
  resetBtn: $('resetBtn'),
  installBtn: $('installBtn'),
  collectionList: $('collectionList'),
  catchCount: $('catchCount'),
  encounter: {
    layer: $('encounterLayer'),
    video: $('cameraVideo'),
    fallback: $('cameraFallback'),
    pixiHost: $('pixiHost'),
    closeBtn: $('closeEncounterBtn'),
    pulseBtn: $('pulseBtn'),
    motionBtn: $('motionBtn'),
    title: $('encounterTitle'),
    hint: $('encounterHint'),
  },
};

const state = {
  map: null,
  userMarker: null,
  accuracyCircle: null,
  spawnLayer: null,
  spawnZones: new Map(),
  spawns: [...DEFAULT_SPAWNS],
  catches: [],
  position: null,
  accuracy: null,
  selectedSpawnId: null,
  nearest: null,
  active: null,
  simulated: false,
  watchId: null,
  deferredInstallPrompt: null,
};

const encounter = new EncounterController(els.encounter);

function randomCreatureId() {
  const ids = Object.keys(CREATURES);
  return ids[Math.floor(Math.random() * ids.length)];
}

function setStatus(message) {
  els.statusPill.textContent = message;
}

function initMap() {
  if (!window.L) {
    setStatus('Leaflet failed to load');
    return;
  }

  state.map = L.map(els.map, {
    zoomControl: true,
    tap: true,
  }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_CENTER.zoom);

  L.tileLayer(TILE_LAYER.url, {
    maxZoom: TILE_LAYER.maxZoom,
    attribution: TILE_LAYER.attribution,
  }).addTo(state.map);

  state.spawnLayer = L.layerGroup().addTo(state.map);
  renderSpawns();

  state.map.on('click', (event) => {
    state.selectedSpawnId = null;
    updateNearest();
    setStatus(`Map point: ${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`);
  });
}

function renderSpawns() {
  if (!state.spawnLayer) return;
  state.spawnLayer.clearLayers();
  state.spawnZones.clear();

  for (const spawn of state.spawns) {
    const creature = getCreature(spawn.creatureId);
    const zone = L.circle([spawn.lat, spawn.lng], {
      radius: spawn.radiusM,
      color: spawn.source === 'custom' ? '#9ff6ce' : '#7cc9ff',
      fillColor: spawn.source === 'custom' ? '#9ff6ce' : '#7cc9ff',
      fillOpacity: 0.13,
      weight: 2,
    }).addTo(state.spawnLayer);

    const marker = L.circleMarker([spawn.lat, spawn.lng], {
      radius: 9,
      color: '#ffffff',
      fillColor: spawn.source === 'custom' ? '#9ff6ce' : '#7cc9ff',
      fillOpacity: 0.95,
      weight: 2,
    }).addTo(state.spawnLayer);

    marker.bindPopup(`
      <div class="spawn-popup">
        <strong>${creature.name}</strong><br />
        ${spawn.label}<br />
        Radius: ${spawn.radiusM} m
      </div>
    `);
    marker.on('click', () => {
      state.selectedSpawnId = spawn.id;
      updateNearest();
    });

    state.spawnZones.set(spawn.id, { zone, marker });
  }
}

function updateUserPosition(position, { simulated = false, accuracy = null } = {}) {
  state.position = position;
  state.accuracy = accuracy;
  state.simulated = simulated;

  if (!state.map) return;
  const latLng = [position.lat, position.lng];
  if (!state.userMarker) {
    state.userMarker = L.circleMarker(latLng, {
      radius: 8,
      color: '#101826',
      weight: 3,
      fillColor: '#ffffff',
      fillOpacity: 1,
    }).addTo(state.map).bindTooltip('You / simulated position');
  } else {
    state.userMarker.setLatLng(latLng);
  }

  if (state.accuracyCircle) state.accuracyCircle.remove();
  if (accuracy && Number.isFinite(accuracy)) {
    state.accuracyCircle = L.circle(latLng, {
      radius: Math.min(accuracy, 160),
      color: '#ffffff',
      fillColor: '#ffffff',
      fillOpacity: 0.08,
      weight: 1,
      opacity: 0.45,
    }).addTo(state.map);
  }

  updateNearest();
}

function findNearestSpawn() {
  if (!state.position) return null;
  let best = null;
  for (const spawn of state.spawns) {
    const distance = distanceMeters(state.position, spawn);
    const signal = signalFromDistance(distance, spawn.radiusM);
    const candidate = { spawn, distance, signal, inside: distance <= spawn.radiusM };
    if (!best || distance < best.distance) best = candidate;
  }
  return best;
}

function updateNearest() {
  const selected = state.selectedSpawnId
    ? state.spawns.find((spawn) => spawn.id === state.selectedSpawnId)
    : null;

  let nearest = findNearestSpawn();
  if (selected && state.position) {
    const distance = distanceMeters(state.position, selected);
    nearest = {
      spawn: selected,
      distance,
      signal: signalFromDistance(distance, selected.radiusM),
      inside: distance <= selected.radiusM,
    };
  }

  state.nearest = nearest;
  state.active = nearest?.inside ? nearest : null;

  for (const [id, layers] of state.spawnZones) {
    const selectedOrActive = id === nearest?.spawn.id;
    layers.zone.setStyle({
      fillOpacity: selectedOrActive ? 0.26 : 0.13,
      weight: selectedOrActive ? 4 : 2,
    });
    layers.marker.setStyle({ radius: selectedOrActive ? 12 : 9 });
  }

  if (!state.position) {
    els.nearestName.textContent = 'No location yet';
    els.nearestDetails.textContent = 'Allow location, spawn a test creature, or use simulation mode.';
    els.signalBadge.textContent = '0%';
    els.signalBar.style.width = '0%';
    els.encounterBtn.disabled = true;
    setStatus('Waiting for location');
    return;
  }

  if (!nearest) {
    els.nearestName.textContent = 'No spawns configured';
    els.nearestDetails.textContent = 'Create a local test spawn to begin.';
    els.signalBadge.textContent = '0%';
    els.signalBar.style.width = '0%';
    els.encounterBtn.disabled = true;
    return;
  }

  const creature = getCreature(nearest.spawn.creatureId);
  els.nearestName.textContent = nearest.inside ? `${creature.name} is here` : `${creature.name} signal`;
  els.nearestDetails.textContent = `${nearest.spawn.label}: ${formatDistance(nearest.distance)} away. Zone radius: ${nearest.spawn.radiusM} m.`;
  els.signalBadge.textContent = `${nearest.signal}%`;
  els.signalBar.style.width = `${nearest.signal}%`;
  els.encounterBtn.disabled = !nearest.inside;

  const mode = state.simulated ? 'Simulation' : 'GPS';
  setStatus(nearest.inside ? `${mode}: encounter available` : `${mode}: nearest ${formatDistance(nearest.distance)}`);
}

async function loadLocalData() {
  try {
    const [customSpawns, catches] = await Promise.all([
      getAll('customSpawns'),
      getAll('catches'),
    ]);
    state.spawns = [...DEFAULT_SPAWNS, ...customSpawns];
    state.catches = catches.sort((a, b) => b.caughtAt.localeCompare(a.caughtAt));
  } catch (error) {
    console.warn('IndexedDB unavailable or failed:', error);
    state.spawns = [...DEFAULT_SPAWNS];
    state.catches = [];
  }
}

function renderCollection() {
  els.catchCount.textContent = String(state.catches.length);
  if (state.catches.length === 0) {
    els.collectionList.innerHTML = '<p class="muted">Nothing caught yet. Enter a geozone and open the scanner.</p>';
    return;
  }

  els.collectionList.innerHTML = '';
  for (const record of state.catches.slice(0, 8)) {
    const item = document.createElement('article');
    item.className = 'catch-card';
    const caughtDate = new Date(record.caughtAt);
    item.innerHTML = `
      <div class="catch-icon" aria-hidden="true"></div>
      <div>
        <strong>${record.creatureName}</strong>
        <span>${record.rarity} · ${caughtDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
    `;
    els.collectionList.appendChild(item);
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    setStatus('Geolocation unavailable');
    return;
  }

  setStatus('Requesting location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateUserPosition(position, { simulated: false, accuracy: pos.coords.accuracy });
      state.map?.setView([position.lat, position.lng], Math.max(state.map.getZoom(), 16));
      startWatch();
    },
    (error) => {
      console.warn(error);
      setStatus('Location blocked — use simulation');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
  );
}

function startWatch() {
  if (!navigator.geolocation || state.watchId !== null) return;
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (state.simulated) return;
      updateUserPosition(
        { lat: pos.coords.latitude, lng: pos.coords.longitude },
        { simulated: false, accuracy: pos.coords.accuracy },
      );
    },
    (error) => console.warn('watchPosition error:', error),
    { enableHighAccuracy: true, maximumAge: 7000, timeout: 14000 },
  );
}

async function spawnHere() {
  const base = state.position ?? {
    lat: state.map?.getCenter().lat ?? DEFAULT_CENTER.lat,
    lng: state.map?.getCenter().lng ?? DEFAULT_CENTER.lng,
  };
  const creatureId = randomCreatureId();
  const creature = getCreature(creatureId);
  const spawn = {
    id: `custom-${Date.now()}`,
    creatureId,
    label: `Local test signal for ${creature.name}`,
    ...randomOffsetLatLng(base, 8),
    radiusM: 65,
    source: 'custom',
  };
  await saveCustomSpawn(spawn);
  state.spawns.push(spawn);
  state.selectedSpawnId = spawn.id;
  renderSpawns();
  if (!state.position) updateUserPosition(base, { simulated: true });
  updateNearest();
  state.map?.setView([spawn.lat, spawn.lng], 18);
}

function simulateNear() {
  const target = state.nearest?.spawn ?? state.spawns[0];
  if (!target) return;
  const position = randomOffsetLatLng(target, Math.min(12, target.radiusM * 0.35));
  state.selectedSpawnId = target.id;
  updateUserPosition(position, { simulated: true, accuracy: 6 });
  state.map?.setView([position.lat, position.lng], 18);
}

async function resetCatches() {
  await clear('catches');
  state.catches = [];
  renderCollection();
  setStatus('Catches reset');
}

async function openEncounter() {
  const active = state.active;
  if (!active) return;
  const creature = getCreature(active.spawn.creatureId);
  await encounter.start({
    creature,
    spawn: active.spawn,
    position: state.position,
    onComplete: (catchRecord) => {
      state.catches = [catchRecord, ...state.catches];
      renderCollection();
      setStatus(`Caught ${catchRecord.creatureName}`);
    },
  });
}

function setupEvents() {
  els.locateBtn.addEventListener('click', requestLocation);
  els.spawnHereBtn.addEventListener('click', spawnHere);
  els.simulateBtn.addEventListener('click', simulateNear);
  els.resetBtn.addEventListener('click', resetCatches);
  els.encounterBtn.addEventListener('click', openEncounter);
  els.encounter.closeBtn.addEventListener('click', () => encounter.stop());
  els.encounter.pulseBtn.addEventListener('click', () => encounter.pulseFromButton());
  els.encounter.motionBtn.addEventListener('click', () => encounter.enableMotion());

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installBtn.classList.remove('hidden');
  });

  els.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installBtn.classList.add('hidden');
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js');
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}

async function init() {
  console.info(`GeoCritter Lens v${APP_VERSION}`);
  setupEvents();
  await loadLocalData();
  initMap();
  renderSpawns();
  renderCollection();
  updateNearest();
  registerServiceWorker();

  // Start with an approximate demo position so desktop users see useful signal immediately.
  updateUserPosition({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng }, { simulated: true, accuracy: 30 });
}

init();
