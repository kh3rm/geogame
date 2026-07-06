import { APP_VERSION, DEFAULT_CENTER, DEFAULT_SPAWNS, TILE_LAYER } from './config.js';
import { CREATURES, getCreature } from './creatures.js';
import { getAll, saveCustomSpawn, clear, replaceStores, put } from './db.js';
import { buildImportPreview, downloadBackup, mergeBackup, parseBackupFile, replaceBackup, shareBackup } from './backup.js';
import { distanceMeters, formatDistance, signalFromDistance, randomOffsetLatLng } from './geo.js';
import { EncounterController } from './encounter.js';

const ADMIN_PASSWORD = 'AdmiN';
const ADMIN_SCENARIOS_KEY = 'adminScenarios';
const ACTIVE_SCENARIO_KEY = 'activeScenarioId';
const SCENARIO_SOURCE = 'scenario';

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
  backupToggleBtn: $('backupToggleBtn'),
  backupMenuPanel: $('backupMenuPanel'),
  shareBackupBtn: $('shareBackupBtn'),
  downloadBackupBtn: $('downloadBackupBtn'),
  importBackupBtn: $('importBackupBtn'),
  backupFileInput: $('backupFileInput'),
  adminEntryBtn: $('adminEntryBtn'),
  installBtn: $('installBtn'),
  collectionList: $('collectionList'),
  catchCount: $('catchCount'),
  restore: {
    modal: $('restoreModal'),
    summary: $('restoreSummary'),
    catchList: $('restoreCatchList'),
    closeBtn: $('restoreCloseBtn'),
    cancelBtn: $('restoreCancelBtn'),
    mergeBtn: $('restoreMergeBtn'),
    replaceBtn: $('restoreReplaceBtn'),
  },
  detail: {
    modal: $('catchDetailModal'),
    closeBtn: $('catchDetailCloseBtn'),
    title: $('catchDetailTitle'),
    avatar: $('catchDetailAvatar'),
    name: $('catchDetailName'),
    description: $('catchDetailDescription'),
    meta: $('catchDetailMeta'),
    map: $('catchDetailMap'),
    location: $('catchDetailLocation'),
  },
  admin: {
    modal: $('adminModal'),
    closeBtn: $('adminCloseBtn'),
    gate: $('adminGate'),
    builder: $('adminBuilder'),
    passwordForm: $('adminPasswordForm'),
    passwordInput: $('adminPasswordInput'),
    gateStatus: $('adminGateStatus'),
    scenarioSelect: $('adminScenarioSelect'),
    newScenarioBtn: $('adminNewScenarioBtn'),
    activateScenarioBtn: $('adminActivateScenarioBtn'),
    deactivateScenarioBtn: $('adminDeactivateScenarioBtn'),
    activePill: $('adminActivePill'),
    titleInput: $('adminScenarioTitleInput'),
    descriptionInput: $('adminScenarioDescriptionInput'),
    saveScenarioBtn: $('adminSaveScenarioBtn'),
    deleteScenarioBtn: $('adminDeleteScenarioBtn'),
    creatureChoices: $('adminCreatureChoices'),
    spawnLabelInput: $('adminSpawnLabelInput'),
    radiusInput: $('adminRadiusInput'),
    radiusValue: $('adminRadiusValue'),
    countInput: $('adminCountInput'),
    areaInput: $('adminAreaInput'),
    areaValue: $('adminAreaValue'),
    mixCreaturesInput: $('adminMixCreaturesInput'),
    placeModeBtn: $('adminPlaceModeBtn'),
    autoSpreadBtn: $('adminAutoSpreadBtn'),
    useMapCenterBtn: $('adminUseMapCenterBtn'),
    useLocationBtn: $('adminUseLocationBtn'),
    fitScenarioBtn: $('adminFitScenarioBtn'),
    clearScenarioBtn: $('adminClearScenarioBtn'),
    map: $('adminMap'),
    mapHint: $('adminMapHint'),
    mapSubhint: $('adminMapSubhint'),
    scenarioCount: $('adminScenarioCount'),
    caughtCount: $('adminScenarioCaughtCount'),
    scenarioRadius: $('adminScenarioRadius'),
    spawnList: $('adminSpawnList'),
    status: $('adminStatus'),
  },
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
    confirm: $('catchConfirm'),
    confirmText: $('catchConfirmText'),
    confirmCreature: $('catchConfirmCreature'),
  },
};

const state = {
  map: null,
  userMarker: null,
  accuracyCircle: null,
  spawnLayer: null,
  spawnZones: new Map(),
  spawns: [...DEFAULT_SPAWNS],
  customSpawns: [],
  settings: [],
  scenarios: [],
  activeScenarioId: null,
  catches: [],
  position: null,
  accuracy: null,
  selectedSpawnId: null,
  nearest: null,
  active: null,
  simulated: false,
  watchId: null,
  deferredInstallPrompt: null,
  pendingRestore: null,
  detailMap: null,
  detailMarker: null,
  adminUnlocked: false,
  adminScenarioId: null,
  adminSelectedCreatureId: Object.keys(CREATURES)[0] ?? 'mossblip',
  adminPlaceMode: false,
  adminMap: null,
  adminSpawnLayer: null,
  adminAreaLayer: null,
  adminMapReady: false,
  adminShowAreaGuide: false,
  adminAreaHideTimer: null,
};

const encounter = new EncounterController(els.encounter);

function randomCreatureId() {
  const ids = Object.keys(CREATURES);
  return ids[Math.floor(Math.random() * ids.length)];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function signalLevel(signal) {
  if (signal >= 85) return 'Mycket nära';
  if (signal >= 55) return 'Nära';
  if (signal >= 25) return 'Svag signal';
  if (signal > 0) return 'Långt bort';
  return 'Ingen signal';
}

function radiusValue() {
  return Math.round(clampNumber(els.admin.radiusInput.value, 15, 250, 65));
}

function areaValue() {
  return Math.round(clampNumber(els.admin.areaInput.value, 30, 900, 180));
}

function getSettingValue(settings, key, fallback = null) {
  const record = settings.find((item) => item?.key === key);
  return record?.value ?? fallback;
}

function normalizeScenarios(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((scenario) => scenario && typeof scenario.id === 'string' && scenario.id.length > 2)
    .map((scenario) => ({
      id: scenario.id,
      title: String(scenario.title || 'Namnlös promenad').slice(0, 48),
      description: String(scenario.description || '').slice(0, 140),
      createdAt: scenario.createdAt || new Date().toISOString(),
      updatedAt: scenario.updatedAt || scenario.createdAt || new Date().toISOString(),
    }))
    .sort((a, b) => recordTime(b) - recordTime(a));
}

function getScenarioTitle(scenarioId) {
  return state.scenarios.find((scenario) => scenario.id === scenarioId)?.title || 'Promenad';
}

function scenarioSpawnSort(a, b) {
  return (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.label || '').localeCompare(String(b.label || ''), 'sv');
}

function getScenarioSpawns(scenarioId = state.adminScenarioId) {
  if (!scenarioId) return [];
  return state.customSpawns
    .filter((spawn) => spawn.source === SCENARIO_SOURCE && spawn.scenarioId === scenarioId)
    .sort(scenarioSpawnSort);
}

function getFreeCustomSpawns() {
  return state.customSpawns.filter((spawn) => spawn.source !== SCENARIO_SOURCE);
}

function rebuildVisibleSpawns() {
  if (state.activeScenarioId) {
    state.spawns = getScenarioSpawns(state.activeScenarioId);
  } else {
    state.spawns = [...DEFAULT_SPAWNS, ...getFreeCustomSpawns()];
  }
  if (state.selectedSpawnId && !state.spawns.some((spawn) => spawn.id === state.selectedSpawnId)) {
    state.selectedSpawnId = null;
  }
}

function offsetLatLngMeters(center, distanceM, bearingRad) {
  const latRad = center.lat * Math.PI / 180;
  const lat = center.lat + (Math.cos(bearingRad) * distanceM) / 111320;
  const lng = center.lng + (Math.sin(bearingRad) * distanceM) / (111320 * Math.max(0.2, Math.cos(latRad)));
  return { lat, lng };
}

function mapCenterObject(map = state.map) {
  const center = map?.getCenter?.();
  return {
    lat: center?.lat ?? DEFAULT_CENTER.lat,
    lng: center?.lng ?? DEFAULT_CENTER.lng,
  };
}

async function persistScenarios() {
  await put('settings', {
    key: ADMIN_SCENARIOS_KEY,
    value: state.scenarios,
    updatedAt: new Date().toISOString(),
  });
}

async function persistActiveScenario(scenarioId) {
  await put('settings', {
    key: ACTIVE_SCENARIO_KEY,
    value: scenarioId || null,
    updatedAt: new Date().toISOString(),
  });
}

async function persistCustomSpawns(nextSpawns) {
  state.customSpawns = nextSpawns;
  await replaceStores({ customSpawns: nextSpawns });
}

function setStatus(message) {
  els.statusPill.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Okänd tid';
  return date.toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
}

function getCatchDisplay(record) {
  const creature = getCreature(record.creatureId);
  const spawn = state.spawns.find((item) => item.id === record.spawnId);
  return {
    creature,
    name: record.creatureName || creature.name || record.creatureId || 'Okänd figur',
    rarity: record.rarity || creature.rarity || 'Okänd',
    caughtAt: formatDateTime(record.caughtAt),
    spawnLabel: record.spawnLabel || spawn?.label || record.spawnId || 'Okänd plats',
    description: creature.description || 'En mystisk liten figur fångad i skannern.',
  };
}

function colorToCss(color) {
  return `#${Number(color).toString(16).padStart(6, '0')}`;
}

function applyCreatureStyle(element, creature) {
  element.style.setProperty('--creature-color', colorToCss(creature.color));
  element.style.setProperty('--creature-accent', colorToCss(creature.accent));
  element.style.setProperty('--creature-shadow', colorToCss(creature.shadow));
  element.dataset.creature = creature.id;
}

function makeCreatureAvatar(creature, className = '') {
  const avatar = document.createElement('div');
  avatar.className = `creature-avatar ${className}`.trim();
  avatar.setAttribute('aria-hidden', 'true');
  applyCreatureStyle(avatar, creature);
  return avatar;
}

function getCatchLocation(record) {
  const spawn = state.spawns.find((item) => item.id === record.spawnId);
  const lat = Number(record.spawnLat ?? spawn?.lat ?? record.lat);
  const lng = Number(record.spawnLng ?? spawn?.lng ?? record.lng);
  const radiusM = Number(record.radiusM ?? spawn?.radiusM ?? 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, radiusM, spawn };
}

function makeCatchCard(record, { includeZone = false, interactive = false } = {}) {
  const display = getCatchDisplay(record);
  const item = document.createElement('article');
  item.className = interactive ? 'catch-card catch-card-clickable' : 'catch-card';
  if (interactive) {
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Visa fångst: ${display.name}`);
  }
  const avatar = makeCreatureAvatar(display.creature, 'small');
  const text = document.createElement('div');
  text.innerHTML = `
    <strong>${escapeHtml(display.name)}</strong>
    <span>${escapeHtml(display.rarity)} · ${escapeHtml(display.caughtAt)}</span>
    ${includeZone ? `<span>${escapeHtml(display.spawnLabel)}</span>` : ''}
  `;
  item.append(avatar, text);
  if (interactive) {
    item.addEventListener('click', () => openCatchDetail(record));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCatchDetail(record);
      }
    });
  }
  return item;
}


function recordTime(record) {
  return Date.parse(record.updatedAt || record.caughtAt || record.createdAt || '1970-01-01T00:00:00.000Z');
}

function dedupeCatchesBySpawn(catches) {
  const byKey = new Map();
  for (const record of catches) {
    const key = record.spawnId || record.id;
    const existing = byKey.get(key);
    if (!existing || recordTime(record) >= recordTime(existing)) byKey.set(key, record);
  }
  return [...byKey.values()];
}

function getCatchForSpawn(spawnId) {
  return state.catches.find((record) => record.spawnId === spawnId);
}

function isSpawnCaught(spawnId) {
  return Boolean(getCatchForSpawn(spawnId));
}

function initMap() {
  if (!window.L) {
    setStatus('Leaflet kunde inte laddas');
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
    setStatus(`Kartpunkt: ${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`);
  });
}

function renderSpawns() {
  if (!state.spawnLayer) return;
  state.spawnLayer.clearLayers();
  state.spawnZones.clear();

  for (const spawn of state.spawns) {
    const creature = getCreature(spawn.creatureId);
    const caught = isSpawnCaught(spawn.id);
    const spawnColor = caught ? '#c8ccd6' : spawn.source === SCENARIO_SOURCE ? '#f5cb6b' : spawn.source === 'custom' ? '#9ff6ce' : '#7cc9ff';
    const zone = L.circle([spawn.lat, spawn.lng], {
      radius: spawn.radiusM,
      color: spawnColor,
      fillColor: spawnColor,
      fillOpacity: 0,
      opacity: 0,
      weight: 1,
      interactive: false,
    }).addTo(state.spawnLayer);

    const marker = L.circleMarker([spawn.lat, spawn.lng], {
      radius: 9,
      color: '#ffffff',
      fillColor: spawnColor,
      fillOpacity: caught ? 0.62 : 0.96,
      weight: 2,
    }).addTo(state.spawnLayer);

    const scenarioLine = spawn.source === SCENARIO_SOURCE
      ? `<br /><small>Promenad: ${escapeHtml(spawn.scenarioTitle || getScenarioTitle(spawn.scenarioId))}</small>`
      : '';
    marker.bindPopup(`
      <div class="spawn-popup">
        <strong>${escapeHtml(creature.name)}</strong><br />
        ${escapeHtml(spawn.label)}${scenarioLine}<br />
        Status: ${caught ? 'fångad' : 'ledig'}<br />
        Fångstavstånd: ${Math.round(spawn.radiusM)} m
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
    }).addTo(state.map).bindTooltip('Du / simulerad position');
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
  const nearestCaught = nearest ? isSpawnCaught(nearest.spawn.id) : false;
  state.active = nearest?.inside && !nearestCaught ? nearest : null;

  for (const [id, layers] of state.spawnZones) {
    const selectedOrActive = id === nearest?.spawn.id;
    const caught = isSpawnCaught(id);
    const spawn = state.spawns.find((item) => item.id === id);
    const normalColor = spawn?.source === SCENARIO_SOURCE ? '#f5cb6b' : spawn?.source === 'custom' ? '#9ff6ce' : '#7cc9ff';
    const color = caught ? '#c8ccd6' : normalColor;
    layers.zone.setStyle({
      fillOpacity: caught ? 0 : selectedOrActive ? 0.09 : 0,
      opacity: caught ? 0 : selectedOrActive ? 0.55 : 0,
      weight: selectedOrActive ? 1.5 : 0,
      color,
      fillColor: color,
    });
    layers.marker.setStyle({
      radius: selectedOrActive ? 12 : 9,
      fillColor: color,
      fillOpacity: caught ? 0.62 : 0.96,
    });
  }

  if (!state.position) {
    els.nearestName.textContent = 'Ingen plats än';
    els.nearestDetails.textContent = 'Tillåt plats, skapa en testfigur eller använd simulering.';
    els.signalBadge.textContent = '0%';
    els.signalBar.style.width = '0%';
    els.encounterBtn.disabled = true;
    els.encounterBtn.textContent = 'Öppna kamerafångst';
    setStatus('Väntar på plats');
    return;
  }

  if (!nearest) {
    els.nearestName.textContent = 'Inga figurer finns';
    els.nearestDetails.textContent = 'Skapa en lokal testfigur för att börja.';
    els.signalBadge.textContent = '0%';
    els.signalBar.style.width = '0%';
    els.encounterBtn.disabled = true;
    els.encounterBtn.textContent = 'Öppna kamerafångst';
    return;
  }

  const creature = getCreature(nearest.spawn.creatureId);
  const alreadyCaught = isSpawnCaught(nearest.spawn.id);
  const level = signalLevel(nearest.signal);
  els.nearestName.textContent = alreadyCaught
    ? `${creature.name} är redan fångad`
    : nearest.inside
      ? `${creature.name} är här`
      : `${creature.name}-signal`;
  els.nearestDetails.textContent = `${level} · ${formatDistance(nearest.distance)} bort · fångst möjlig inom ${Math.round(nearest.spawn.radiusM)} m. ${nearest.spawn.label}`;
  els.signalBadge.textContent = `${nearest.signal}%`;
  els.signalBadge.setAttribute('aria-label', `Figursignal ${nearest.signal} procent, ${level.toLowerCase()}`);
  els.signalBar.style.width = `${nearest.signal}%`;
  els.encounterBtn.disabled = !nearest.inside || alreadyCaught;
  els.encounterBtn.textContent = alreadyCaught ? 'Redan fångad här' : 'Öppna kamerafångst';

  const mode = state.simulated ? 'Simulering' : 'GPS';
  setStatus(alreadyCaught
    ? `${mode}: platsen är redan fångad`
    : nearest.inside
      ? `${mode}: fångst tillgänglig`
      : `${mode}: ${level.toLowerCase()}`);
}

async function loadLocalData() {
  try {
    const [customSpawns, catches, settings] = await Promise.all([
      getAll('customSpawns'),
      getAll('catches'),
      getAll('settings'),
    ]);
    state.customSpawns = customSpawns;
    state.settings = settings;
    state.scenarios = normalizeScenarios(getSettingValue(settings, ADMIN_SCENARIOS_KEY, []));
    const savedActiveScenarioId = getSettingValue(settings, ACTIVE_SCENARIO_KEY, null);
    state.activeScenarioId = state.scenarios.some((scenario) => scenario.id === savedActiveScenarioId)
      ? savedActiveScenarioId
      : null;
    if (state.adminScenarioId && !state.scenarios.some((scenario) => scenario.id === state.adminScenarioId)) {
      state.adminScenarioId = null;
    }
    state.adminScenarioId = state.adminScenarioId || state.activeScenarioId || state.scenarios[0]?.id || null;
    rebuildVisibleSpawns();
    const dedupedCatches = dedupeCatchesBySpawn(catches);
    if (dedupedCatches.length !== catches.length) {
      await replaceStores({ catches: dedupedCatches });
    }
    state.catches = dedupedCatches.sort((a, b) => b.caughtAt.localeCompare(a.caughtAt));
  } catch (error) {
    console.warn('IndexedDB unavailable or failed:', error);
    state.customSpawns = [];
    state.settings = [];
    state.scenarios = [];
    state.activeScenarioId = null;
    state.spawns = [...DEFAULT_SPAWNS];
    state.catches = [];
  }
}

function renderCollection() {
  els.catchCount.textContent = String(state.catches.length);
  if (state.catches.length === 0) {
    els.collectionList.innerHTML = '<p class="muted">Inget fångat än. Gå nära en figur och öppna skannern.</p>';
    return;
  }

  els.collectionList.innerHTML = '';
  for (const record of state.catches.slice(0, 12)) {
    els.collectionList.appendChild(makeCatchCard(record, { includeZone: true, interactive: true }));
  }

  if (state.catches.length > 12) {
    const note = document.createElement('p');
    note.className = 'tiny';
    note.textContent = `Visar 12 av ${state.catches.length} fångster.`;
    els.collectionList.appendChild(note);
  }
}

function closeCatchDetail() {
  els.detail.modal.classList.add('hidden');
  els.detail.modal.setAttribute('aria-hidden', 'true');
}

function openCatchDetail(record) {
  const display = getCatchDisplay(record);
  const location = getCatchLocation(record);

  els.detail.title.textContent = `${display.name} fångad`;
  els.detail.name.textContent = display.name;
  els.detail.description.textContent = display.description;
  els.detail.avatar.className = 'creature-avatar large';
  applyCreatureStyle(els.detail.avatar, display.creature);

  els.detail.meta.innerHTML = `
    <div><span>Typ</span><strong>${escapeHtml(display.rarity)}</strong></div>
    <div><span>Fångad</span><strong>${escapeHtml(display.caughtAt)}</strong></div>
    <div><span>Plats</span><strong>${escapeHtml(display.spawnLabel)}</strong></div>
  `;

  if (location) {
    els.detail.location.textContent = `Position: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}${location.radiusM ? ` · fångstavstånd ${Math.round(location.radiusM)} m` : ''}`;
  } else {
    els.detail.location.textContent = 'Ingen sparad position för denna äldre fångst.';
  }

  els.detail.modal.classList.remove('hidden');
  els.detail.modal.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    if (!window.L || !location) {
      els.detail.map.innerHTML = '<div class="map-empty">Ingen kartposition sparad</div>';
      return;
    }

    if (!state.detailMap) {
      state.detailMap = L.map(els.detail.map, {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      });
      L.tileLayer(TILE_LAYER.url, { maxZoom: TILE_LAYER.maxZoom, attribution: TILE_LAYER.attribution }).addTo(state.detailMap);
    }

    const latLng = [location.lat, location.lng];
    state.detailMap.setView(latLng, 17);
    if (state.detailMarker) {
      state.detailMarker.marker.remove();
      state.detailMarker.circle?.remove();
    }
    const circle = location.radiusM
      ? L.circle(latLng, {
          radius: location.radiusM,
          color: '#9ff6ce',
          fillColor: '#9ff6ce',
          fillOpacity: 0.12,
          weight: 2,
        }).addTo(state.detailMap)
      : null;
    const marker = L.circleMarker(latLng, {
      radius: 9,
      color: '#ffffff',
      fillColor: colorToCss(display.creature.color),
      fillOpacity: 1,
      weight: 2,
    }).addTo(state.detailMap);
    state.detailMarker = { marker, circle };
    state.detailMap.invalidateSize();
  }, 60);
}

function requestLocation() {
  if (!navigator.geolocation) {
    setStatus('Geolokalisering saknas');
    return;
  }

  setStatus('Hämtar plats…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateUserPosition(position, { simulated: false, accuracy: pos.coords.accuracy });
      state.map?.setView([position.lat, position.lng], Math.max(state.map.getZoom(), 16));
      startWatch();
    },
    (error) => {
      console.warn(error);
      setStatus('Plats blockerad — använd simulering');
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
    label: `Lokal testsignal för ${creature.name}`,
    ...randomOffsetLatLng(base, 8),
    radiusM: 65,
    source: 'custom',
    updatedAt: new Date().toISOString(),
  };
  const savedSpawn = await saveCustomSpawn(spawn);
  state.customSpawns.push(savedSpawn);
  if (!state.activeScenarioId) state.spawns.push(savedSpawn);
  state.selectedSpawnId = savedSpawn.id;
  renderSpawns();
  if (!state.position) updateUserPosition(base, { simulated: true });
  updateNearest();
  state.map?.setView([savedSpawn.lat, savedSpawn.lng], 18);
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
  renderSpawns();
  updateNearest();
  setStatus('Fångster nollställda');
}


function setAdminStatus(message) {
  els.admin.status.textContent = message;
}

function currentScenario() {
  return state.scenarios.find((scenario) => scenario.id === state.adminScenarioId) ?? null;
}

function setAdminPlaceMode(enabled) {
  state.adminPlaceMode = Boolean(enabled);
  els.admin.placeModeBtn.textContent = state.adminPlaceMode ? 'Placering aktiv' : 'Placera på kartan';
  els.admin.placeModeBtn.classList.toggle('primary', state.adminPlaceMode);
  els.admin.map.classList.toggle('is-placing', state.adminPlaceMode);
  els.admin.mapHint.textContent = state.adminPlaceMode ? 'Tryck på kartan för att placera' : 'Byggkarta';
  els.admin.mapSubhint.textContent = state.adminPlaceMode
    ? 'Varje tryck lägger ut vald figur i den aktiva promenaden.'
    : 'Flytta kartan, välj figur och placera platser.';
}

function updateAdminButtons() {
  const scenario = currentScenario();
  const hasScenario = Boolean(scenario);
  const scenarioSpawns = getScenarioSpawns();
  const isActive = Boolean(scenario && state.activeScenarioId === scenario.id);

  els.admin.activateScenarioBtn.disabled = !hasScenario || scenarioSpawns.length === 0 || isActive;
  els.admin.deactivateScenarioBtn.disabled = !state.activeScenarioId;
  els.admin.saveScenarioBtn.disabled = !hasScenario;
  els.admin.deleteScenarioBtn.disabled = !hasScenario;
  els.admin.placeModeBtn.disabled = !hasScenario;
  els.admin.autoSpreadBtn.disabled = !hasScenario;
  els.admin.fitScenarioBtn.disabled = !hasScenario || scenarioSpawns.length === 0;
  els.admin.clearScenarioBtn.disabled = !hasScenario || scenarioSpawns.length === 0;
  els.admin.activePill.textContent = isActive ? 'Aktiv' : state.activeScenarioId ? 'Annan aktiv' : 'Ej aktiv';
}

function renderAdminCreatureChoices() {
  els.admin.creatureChoices.innerHTML = '';
  for (const creature of Object.values(CREATURES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-creature-choice';
    button.classList.toggle('is-active', creature.id === state.adminSelectedCreatureId);
    button.setAttribute('aria-pressed', String(creature.id === state.adminSelectedCreatureId));
    const avatar = makeCreatureAvatar(creature, 'small');
    const label = document.createElement('span');
    label.innerHTML = `<strong>${escapeHtml(creature.name)}</strong><span>${escapeHtml(creature.rarity)}</span>`;
    button.append(avatar, label);
    button.addEventListener('click', () => {
      state.adminSelectedCreatureId = creature.id;
      renderAdminCreatureChoices();
      setAdminStatus(`${creature.name} vald för nästa placering.`);
    });
    els.admin.creatureChoices.appendChild(button);
  }
}

function renderAdminSpawnList() {
  const scenario = currentScenario();
  const spawns = getScenarioSpawns();
  els.admin.spawnList.innerHTML = '';
  els.admin.scenarioCount.textContent = String(spawns.length);
  els.admin.caughtCount.textContent = String(spawns.filter((spawn) => isSpawnCaught(spawn.id)).length);
  syncAdminRangeLabels();
  els.admin.scenarioRadius.textContent = `${radiusValue()} m`;

  if (!scenario) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Ingen promenad vald. Skapa en ny promenad för att börja placera ut figurer.';
    els.admin.spawnList.appendChild(empty);
    return;
  }

  if (spawns.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Promenaden har inga figurer än. Tryck Placera på kartan eller Auto-sprid i området.';
    els.admin.spawnList.appendChild(empty);
    return;
  }

  for (const spawn of spawns) {
    const creature = getCreature(spawn.creatureId);
    const item = document.createElement('article');
    item.className = 'admin-spawn-card';
    const avatar = makeCreatureAvatar(creature, 'small');
    const text = document.createElement('div');
    text.innerHTML = `
      <strong>${escapeHtml(creature.name)}</strong>
      <span>${escapeHtml(spawn.label || scenario.title)} · ${Math.round(spawn.radiusM)} m · ${isSpawnCaught(spawn.id) ? 'fångad' : 'ledig'}</span>
      <span>${Number(spawn.lat).toFixed(5)}, ${Number(spawn.lng).toFixed(5)}</span>
    `;
    const actions = document.createElement('div');
    actions.className = 'admin-spawn-actions';
    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.textContent = 'Visa';
    showBtn.addEventListener('click', () => {
      state.adminMap?.setView([spawn.lat, spawn.lng], 18);
      setAdminStatus(`Visar ${creature.name} på byggkartan.`);
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'danger';
    removeBtn.textContent = 'Ta bort';
    removeBtn.addEventListener('click', () => removeScenarioSpawn(spawn.id));
    actions.append(showBtn, removeBtn);
    item.append(avatar, text, actions);
    els.admin.spawnList.appendChild(item);
  }
}

function renderAdminScenarioSelector() {
  const select = els.admin.scenarioSelect;
  select.innerHTML = '';

  if (state.scenarios.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Ingen promenad ännu';
    select.appendChild(option);
    state.adminScenarioId = null;
  } else {
    if (!state.adminScenarioId || !state.scenarios.some((scenario) => scenario.id === state.adminScenarioId)) {
      state.adminScenarioId = state.activeScenarioId || state.scenarios[0].id;
    }
    for (const scenario of state.scenarios) {
      const option = document.createElement('option');
      option.value = scenario.id;
      const count = getScenarioSpawns(scenario.id).length;
      const active = state.activeScenarioId === scenario.id ? ' · aktiv' : '';
      option.textContent = `${scenario.title} (${count})${active}`;
      select.appendChild(option);
    }
    select.value = state.adminScenarioId;
  }

  const scenario = currentScenario();
  els.admin.titleInput.value = scenario?.title ?? '';
  els.admin.descriptionInput.value = scenario?.description ?? '';
}

function syncAdminRangeLabels() {
  if (els.admin.radiusValue) els.admin.radiusValue.textContent = `${radiusValue()} m`;
  if (els.admin.areaValue) els.admin.areaValue.textContent = `${areaValue()} m`;
}

function setAdminAreaGuide(visible, { autoHide = false } = {}) {
  state.adminShowAreaGuide = Boolean(visible);
  if (state.adminAreaHideTimer) {
    clearTimeout(state.adminAreaHideTimer);
    state.adminAreaHideTimer = null;
  }
  renderAdminArea();
  if (visible && autoHide) {
    state.adminAreaHideTimer = setTimeout(() => setAdminAreaGuide(false), 2400);
  }
}

function renderAdminArea() {
  if (!state.adminAreaLayer || !state.adminMap) return;
  state.adminAreaLayer.clearLayers();
  syncAdminRangeLabels();
  if (!state.adminShowAreaGuide) return;
  const areaM = areaValue();
  const center = state.adminMap.getCenter();
  L.circle([center.lat, center.lng], {
    radius: areaM,
    color: '#7cc9ff',
    fillColor: '#7cc9ff',
    fillOpacity: 0.045,
    weight: 1.4,
    dashArray: '5 9',
  }).addTo(state.adminAreaLayer).bindTooltip('Spridningsområde för auto-spridning', { permanent: false });
}

function refreshAdminMap({ fit = false } = {}) {
  if (!state.adminMap || !state.adminSpawnLayer) return;
  state.adminSpawnLayer.clearLayers();
  const scenario = currentScenario();
  const spawns = getScenarioSpawns();

  for (const spawn of spawns) {
    const creature = getCreature(spawn.creatureId);
    const caught = isSpawnCaught(spawn.id);
    const color = caught ? '#c8ccd6' : colorToCss(creature.color);
    L.circle([spawn.lat, spawn.lng], {
      radius: spawn.radiusM,
      color,
      fillColor: color,
      fillOpacity: caught ? 0.025 : 0.065,
      opacity: 0.48,
      weight: 1.2,
      dashArray: '3 8',
    }).addTo(state.adminSpawnLayer);
    L.circleMarker([spawn.lat, spawn.lng], {
      radius: 9,
      color: '#ffffff',
      fillColor: color,
      fillOpacity: 0.96,
      weight: 2,
    })
      .bindPopup(`<div class="spawn-popup"><strong>${escapeHtml(creature.name)}</strong><br />${escapeHtml(spawn.label)}<br />${caught ? 'Fångad' : 'Ledig'} · ${Math.round(spawn.radiusM)} m fångstavstånd</div>`)
      .addTo(state.adminSpawnLayer);
  }

  renderAdminArea();
  if (fit && spawns.length > 0) {
    const bounds = L.latLngBounds(spawns.map((spawn) => [spawn.lat, spawn.lng]));
    state.adminMap.fitBounds(bounds.pad(0.28), { maxZoom: 18 });
  } else if (!state.adminMapReady) {
    const start = state.position || mapCenterObject(state.map) || { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng };
    state.adminMap.setView([start.lat, start.lng], state.map?.getZoom?.() ?? DEFAULT_CENTER.zoom);
  }
  state.adminMapReady = true;
  setTimeout(() => state.adminMap?.invalidateSize(), 60);
  if (scenario) els.admin.mapSubhint.textContent = `${scenario.title}: ${spawns.length} planerade figurer.`;
}

function ensureAdminMap() {
  if (!window.L) {
    setAdminStatus('Leaflet kunde inte laddas, så byggkartan kan inte visas.');
    return;
  }
  if (!state.adminMap) {
    state.adminMap = L.map(els.admin.map, {
      zoomControl: true,
      tap: true,
    });
    L.tileLayer(TILE_LAYER.url, {
      maxZoom: TILE_LAYER.maxZoom,
      attribution: TILE_LAYER.attribution,
    }).addTo(state.adminMap);
    state.adminAreaLayer = L.layerGroup().addTo(state.adminMap);
    state.adminSpawnLayer = L.layerGroup().addTo(state.adminMap);
    const start = state.position || mapCenterObject(state.map);
    state.adminMap.setView([start.lat, start.lng], Math.max(state.map?.getZoom?.() ?? DEFAULT_CENTER.zoom, 15));
    state.adminMap.on('click', (event) => handleAdminMapClick(event));
    state.adminMap.on('moveend', renderAdminArea);
  }
  refreshAdminMap();
}

function renderAdminBuilder() {
  renderAdminScenarioSelector();
  renderAdminCreatureChoices();
  renderAdminSpawnList();
  updateAdminButtons();
  refreshAdminMap();
}

function showAdminGate() {
  els.admin.gate.classList.remove('hidden');
  els.admin.builder.classList.add('hidden');
  els.admin.passwordInput.value = '';
  els.admin.gateStatus.textContent = 'Admin är bara ett diskret lokalt skydd, inte riktig säkerhet.';
  setTimeout(() => els.admin.passwordInput.focus(), 60);
}

function showAdminBuilder() {
  els.admin.gate.classList.add('hidden');
  els.admin.builder.classList.remove('hidden');
  renderAdminBuilder();
  setTimeout(ensureAdminMap, 80);
}

function openAdminModal() {
  closeBackupMenu();
  els.admin.modal.classList.remove('hidden');
  els.admin.modal.setAttribute('aria-hidden', 'false');
  if (state.adminUnlocked) showAdminBuilder();
  else showAdminGate();
}

function closeAdminModal() {
  els.admin.modal.classList.add('hidden');
  els.admin.modal.setAttribute('aria-hidden', 'true');
  setAdminPlaceMode(false);
}

async function unlockAdmin(event) {
  event?.preventDefault();
  if (els.admin.passwordInput.value === ADMIN_PASSWORD) {
    state.adminUnlocked = true;
    showAdminBuilder();
    setAdminStatus('Adminläge öppnat. Skapa eller välj en promenad för att placera ut figurer.');
  } else {
    els.admin.gateStatus.textContent = 'Fel lösenord.';
    els.admin.passwordInput.select();
  }
}

async function createScenario() {
  const now = new Date().toISOString();
  const currentTitle = currentScenario()?.title || '';
  const typedTitle = els.admin.titleInput.value.trim();
  const title = typedTitle && typedTitle !== currentTitle ? typedTitle : `Promenad ${state.scenarios.length + 1}`;
  const scenario = {
    id: `scenario-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: title.slice(0, 48),
    description: els.admin.descriptionInput.value.trim().slice(0, 140),
    createdAt: now,
    updatedAt: now,
  };
  state.scenarios = [scenario, ...state.scenarios];
  state.adminScenarioId = scenario.id;
  await persistScenarios();
  renderAdminBuilder();
  setAdminStatus(`Promenaden "${scenario.title}" skapades.`);
}

async function saveScenarioMeta() {
  const scenario = currentScenario();
  if (!scenario) return;
  const oldTitle = scenario.title;
  const title = els.admin.titleInput.value.trim() || oldTitle || 'Namnlös promenad';
  const description = els.admin.descriptionInput.value.trim();
  const now = new Date().toISOString();
  state.scenarios = state.scenarios.map((item) => item.id === scenario.id
    ? { ...item, title: title.slice(0, 48), description: description.slice(0, 140), updatedAt: now }
    : item);
  state.customSpawns = state.customSpawns.map((spawn) => spawn.scenarioId === scenario.id
    ? { ...spawn, scenarioTitle: title.slice(0, 48), updatedAt: now }
    : spawn);
  await Promise.all([
    persistScenarios(),
    persistCustomSpawns(state.customSpawns),
  ]);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminBuilder();
  updateNearest();
  setAdminStatus(`Promenaden sparades som "${title.slice(0, 48)}".`);
}

function makeScenarioSpawn(latLng, { order = null, creatureId = null, label = '' } = {}) {
  const scenario = currentScenario();
  if (!scenario) return null;
  const chosenCreatureId = creatureId || state.adminSelectedCreatureId || randomCreatureId();
  const creature = getCreature(chosenCreatureId);
  const scenarioSpawns = getScenarioSpawns(scenario.id);
  const nextOrder = order ?? scenarioSpawns.length + 1;
  const radiusM = radiusValue();
  const cleanLabel = String(label || els.admin.spawnLabelInput.value || '').trim();
  return {
    id: `scenario-${scenario.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    creatureId: chosenCreatureId,
    label: cleanLabel || `${scenario.title}: ${creature.name} ${nextOrder}`,
    lat: latLng.lat,
    lng: latLng.lng,
    radiusM,
    source: SCENARIO_SOURCE,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    order: nextOrder,
    updatedAt: new Date().toISOString(),
  };
}

async function addScenarioSpawnAt(latLng, options = {}) {
  const scenario = currentScenario();
  if (!scenario) {
    setAdminStatus('Skapa en promenad först.');
    return null;
  }
  const spawn = makeScenarioSpawn(latLng, options);
  if (!spawn) return null;
  const savedSpawn = await saveCustomSpawn(spawn);
  state.customSpawns.push(savedSpawn);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminSpawnList();
  refreshAdminMap();
  updateAdminButtons();
  updateNearest();
  const creature = getCreature(savedSpawn.creatureId);
  setAdminStatus(`${creature.name} placerad i "${scenario.title}".`);
  return savedSpawn;
}

async function handleAdminMapClick(event) {
  if (!state.adminPlaceMode) return;
  await addScenarioSpawnAt({ lat: event.latlng.lat, lng: event.latlng.lng });
}

async function autoSpreadScenario() {
  const scenario = currentScenario();
  setAdminAreaGuide(true, { autoHide: true });
  if (!scenario) {
    setAdminStatus('Skapa en promenad först.');
    return;
  }
  const count = Math.round(clampNumber(els.admin.countInput.value, 1, 24, 5));
  const areaM = areaValue();
  const center = mapCenterObject(state.adminMap);
  const existingCount = getScenarioSpawns(scenario.id).length;
  const creatureIds = Object.keys(CREATURES);
  const mix = els.admin.mixCreaturesInput.checked;
  const baseAngle = (Date.now() % 360) * Math.PI / 180;
  const created = [];

  for (let i = 0; i < count; i += 1) {
    const ringProgress = count === 1 ? 0 : (i + 0.5) / count;
    const distance = Math.max(12, areaM * (0.18 + 0.78 * Math.sqrt(ringProgress)));
    const angle = baseAngle + i * 2.399963229728653;
    const latLng = offsetLatLngMeters(center, distance, angle);
    const creatureId = mix ? creatureIds[(existingCount + i) % creatureIds.length] : state.adminSelectedCreatureId;
    const creature = getCreature(creatureId);
    const order = existingCount + i + 1;
    created.push(makeScenarioSpawn(latLng, {
      order,
      creatureId,
      label: `${scenario.title}: ${creature.name} ${order}`,
    }));
  }

  const validSpawns = created.filter(Boolean);
  for (const spawn of validSpawns) await saveCustomSpawn(spawn);
  state.customSpawns.push(...validSpawns);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminSpawnList();
  refreshAdminMap({ fit: true });
  updateAdminButtons();
  updateNearest();
  setAdminStatus(`${validSpawns.length} figurer spreds ut runt kartans mitt.`);
}

async function removeScenarioSpawn(spawnId) {
  const spawn = state.customSpawns.find((item) => item.id === spawnId);
  if (!spawn) return;
  const nextSpawns = state.customSpawns.filter((item) => item.id !== spawnId);
  await persistCustomSpawns(nextSpawns);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminSpawnList();
  refreshAdminMap();
  updateAdminButtons();
  updateNearest();
  setAdminStatus('Figuren togs bort från promenaden. Eventuell gammal fångst ligger kvar i samlingen.');
}

async function activateScenario() {
  const scenario = currentScenario();
  if (!scenario) return;
  const spawns = getScenarioSpawns(scenario.id);
  if (spawns.length === 0) {
    setAdminStatus('Lägg ut minst en figur innan promenaden körs.');
    return;
  }
  state.activeScenarioId = scenario.id;
  await persistActiveScenario(scenario.id);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminBuilder();
  updateNearest();
  state.map?.fitBounds(L.latLngBounds(spawns.map((spawn) => [spawn.lat, spawn.lng])).pad(0.25), { maxZoom: 17 });
  setStatus(`Promenaden "${scenario.title}" är aktiv`);
  setAdminStatus(`Promenaden "${scenario.title}" körs nu. Huvudkartan visar bara den rundan.`);
}

async function deactivateScenario() {
  state.activeScenarioId = null;
  await persistActiveScenario(null);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminBuilder();
  updateNearest();
  setStatus('Vanligt kartläge aktivt');
  setAdminStatus('Promenadläget är avstängt. Demofigurer och vanliga egna figurer visas igen.');
}

async function deleteScenario() {
  const scenario = currentScenario();
  if (!scenario) return;
  const ok = window.confirm(`Ta bort promenaden "${scenario.title}" och alla dess utplacerade figurer? Fångster i samlingen raderas inte.`);
  if (!ok) return;
  state.scenarios = state.scenarios.filter((item) => item.id !== scenario.id);
  const nextSpawns = state.customSpawns.filter((spawn) => spawn.scenarioId !== scenario.id);
  if (state.activeScenarioId === scenario.id) {
    state.activeScenarioId = null;
    await persistActiveScenario(null);
  }
  await Promise.all([
    persistScenarios(),
    persistCustomSpawns(nextSpawns),
  ]);
  state.adminScenarioId = state.activeScenarioId || state.scenarios[0]?.id || null;
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminBuilder();
  updateNearest();
  setAdminStatus(`Promenaden "${scenario.title}" togs bort.`);
}

async function clearScenarioSpawns() {
  const scenario = currentScenario();
  if (!scenario) return;
  const count = getScenarioSpawns(scenario.id).length;
  if (count === 0) return;
  const ok = window.confirm(`Rensa ${count} figurer från "${scenario.title}"? Fångster i samlingen raderas inte.`);
  if (!ok) return;
  const nextSpawns = state.customSpawns.filter((spawn) => spawn.scenarioId !== scenario.id);
  await persistCustomSpawns(nextSpawns);
  rebuildVisibleSpawns();
  renderSpawns();
  renderAdminSpawnList();
  refreshAdminMap();
  updateAdminButtons();
  updateNearest();
  setAdminStatus(`Alla figurer rensades från "${scenario.title}".`);
}

function useMainMapCenterInAdmin() {
  const center = mapCenterObject(state.map);
  state.adminMap?.setView([center.lat, center.lng], Math.max(state.map?.getZoom?.() ?? 16, 16));
  setAdminStatus('Byggkartan flyttades till huvudkartans mitt.');
}

function useLocationInAdmin() {
  if (!state.position) {
    setAdminStatus('Ingen plats är hämtad ännu. Tryck Använd min plats i huvudvyn först.');
    return;
  }
  state.adminMap?.setView([state.position.lat, state.position.lng], 18);
  setAdminStatus('Byggkartan flyttades till din plats.');
}

function fitScenarioInAdmin() {
  refreshAdminMap({ fit: true });
  setAdminStatus('Visar promenadens alla figurer.');
}
function chooseBackupFile() {
  return new Promise((resolve) => {
    els.backupFileInput.value = '';
    els.backupFileInput.onchange = () => resolve(els.backupFileInput.files?.[0] ?? null);
    els.backupFileInput.click();
  });
}

async function refreshAfterRestore() {
  await loadLocalData();
  renderSpawns();
  renderCollection();
  updateNearest();
  if (state.adminUnlocked) renderAdminBuilder();
}

function toggleBackupMenu(forceOpen = null) {
  const shouldOpen = forceOpen ?? els.backupMenuPanel.classList.contains('hidden');
  els.backupMenuPanel.classList.toggle('hidden', !shouldOpen);
  els.backupToggleBtn.setAttribute('aria-expanded', String(shouldOpen));
}

function closeBackupMenu() {
  toggleBackupMenu(false);
}

function closeRestoreModal() {
  state.pendingRestore = null;
  els.restore.modal.classList.add('hidden');
  els.restore.modal.setAttribute('aria-hidden', 'true');
}

function renderRestoreModal(backup, preview) {
  state.pendingRestore = { backup, preview };

  const exported = preview.exportedAt ? formatDateTime(preview.exportedAt) : 'Okänd';
  const changes = preview.newCatches.length + preview.newSpawns.length + preview.updatedSpawns.length;

  els.restore.summary.innerHTML = `
    <div class="restore-stat"><strong>${preview.newCatches.length}</strong><span>Nya fångster att lägga till</span></div>
    <div class="restore-stat"><strong>${preview.duplicateCatches.length}</strong><span>Finns redan på telefonen</span></div>
    <div class="restore-stat"><strong>${preview.newSpawns.length + preview.updatedSpawns.length}</strong><span>Egna platser att lägga till/uppdatera</span></div>
  `;

  els.restore.catchList.innerHTML = '';
  if (preview.newCatches.length === 0) {
    const note = document.createElement('p');
    note.className = 'restore-note';
    note.textContent = `Inga nya fångster hittades i denna backup. Exporterad: ${exported}.`;
    els.restore.catchList.appendChild(note);
  } else {
    const note = document.createElement('p');
    note.className = 'restore-note';
    note.textContent = `Backup exporterad ${exported}. Granska de nya fångsterna innan de läggs till på den här telefonen.`;
    els.restore.catchList.appendChild(note);

    for (const record of preview.newCatches.slice(0, 30)) {
      els.restore.catchList.appendChild(makeCatchCard(record, { includeZone: true }));
    }

    if (preview.newCatches.length > 30) {
      const more = document.createElement('p');
      more.className = 'tiny';
      more.textContent = `Visar 30 av ${preview.newCatches.length} nya fångster. Alla nya fångster läggs till om du bekräftar.`;
      els.restore.catchList.appendChild(more);
    }
  }

  els.restore.mergeBtn.textContent = changes === 0
    ? 'Inget nytt att lägga till'
    : preview.newCatches.length > 0
      ? `Lägg till ${preview.newCatches.length} fångster`
      : 'Uppdatera platser';
  els.restore.mergeBtn.disabled = changes === 0;
  els.restore.modal.classList.remove('hidden');
  els.restore.modal.setAttribute('aria-hidden', 'false');
}

async function handleShareBackup() {
  closeBackupMenu();
  try {
    const result = await shareBackup();
    if (result.reason === 'cancelled') setStatus('Delning av backup avbröts');
    else if (result.method === 'download') setStatus('Delning saknas — backup laddades ned');
    else setStatus('Backup redo att delas');
  } catch (error) {
    console.error(error);
    setStatus('Backupdelning misslyckades');
  }
}

async function handleDownloadBackup() {
  closeBackupMenu();
  try {
    await downloadBackup();
    setStatus('Backup laddades ned');
  } catch (error) {
    console.error(error);
    setStatus('Nedladdning av backup misslyckades');
  }
}

async function handleImportBackup() {
  closeBackupMenu();
  try {
    const file = await chooseBackupFile();
    if (!file) return;
    const backup = await parseBackupFile(file);
    const preview = await buildImportPreview(backup);
    renderRestoreModal(backup, preview);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Kunde inte importera backup');
  }
}

async function applyMergeRestore() {
  if (!state.pendingRestore) return;
  try {
    const result = await mergeBackup(state.pendingRestore.backup, state.pendingRestore.preview);
    await refreshAfterRestore();
    closeRestoreModal();
    const scenarioNote = result.scenariosMerged ? ` och ${result.scenariosMerged} promenadinställningar` : '';
    setStatus(`Lade till ${result.catchesAdded} fångster${scenarioNote}`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Sammanfogning misslyckades');
  }
}

async function applyReplaceRestore() {
  if (!state.pendingRestore) return;
  const ok = window.confirm('Ersätta lokal sparfil? Det tar bort fångster och egna platser på den här telefonen och återställer vald backup.');
  if (!ok) return;

  try {
    const result = await replaceBackup(state.pendingRestore.backup);
    await refreshAfterRestore();
    closeRestoreModal();
    setStatus(`Återställde ${result.catchesRestored} fångster`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Ersättning misslyckades');
  }
}

async function openEncounter() {
  const active = state.active;
  if (!active) return;
  if (isSpawnCaught(active.spawn.id)) {
    setStatus('Den här platsen är redan fångad');
    updateNearest();
    return;
  }
  const creature = getCreature(active.spawn.creatureId);
  await encounter.start({
    creature,
    spawn: active.spawn,
    position: state.position,
    onComplete: (catchRecord) => {
      state.catches = [
        catchRecord,
        ...state.catches.filter((record) => (record.spawnId || record.id) !== (catchRecord.spawnId || catchRecord.id)),
      ];
      renderCollection();
      renderSpawns();
      updateNearest();
      setStatus(`${catchRecord.creatureName} fångad`);
    },
  });
}

function setupEvents() {
  els.locateBtn.addEventListener('click', requestLocation);
  els.spawnHereBtn.addEventListener('click', spawnHere);
  els.simulateBtn.addEventListener('click', simulateNear);
  els.resetBtn.addEventListener('click', resetCatches);
  els.backupToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleBackupMenu();
  });
  els.backupMenuPanel.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', closeBackupMenu);
  els.shareBackupBtn.addEventListener('click', handleShareBackup);
  els.downloadBackupBtn.addEventListener('click', handleDownloadBackup);
  els.importBackupBtn.addEventListener('click', handleImportBackup);
  els.restore.closeBtn.addEventListener('click', closeRestoreModal);
  els.restore.cancelBtn.addEventListener('click', closeRestoreModal);
  els.restore.mergeBtn.addEventListener('click', applyMergeRestore);
  els.restore.replaceBtn.addEventListener('click', applyReplaceRestore);
  els.adminEntryBtn.addEventListener('click', openAdminModal);
  els.admin.closeBtn.addEventListener('click', closeAdminModal);
  els.admin.modal.addEventListener('click', (event) => {
    if (event.target === els.admin.modal) closeAdminModal();
  });
  els.admin.passwordForm.addEventListener('submit', unlockAdmin);
  els.admin.scenarioSelect.addEventListener('change', () => {
    state.adminScenarioId = els.admin.scenarioSelect.value || null;
    setAdminPlaceMode(false);
    renderAdminBuilder();
    refreshAdminMap({ fit: getScenarioSpawns().length > 0 });
  });
  els.admin.newScenarioBtn.addEventListener('click', createScenario);
  els.admin.saveScenarioBtn.addEventListener('click', saveScenarioMeta);
  els.admin.activateScenarioBtn.addEventListener('click', activateScenario);
  els.admin.deactivateScenarioBtn.addEventListener('click', deactivateScenario);
  els.admin.deleteScenarioBtn.addEventListener('click', deleteScenario);
  els.admin.placeModeBtn.addEventListener('click', () => setAdminPlaceMode(!state.adminPlaceMode));
  els.admin.autoSpreadBtn.addEventListener('click', autoSpreadScenario);
  els.admin.useMapCenterBtn.addEventListener('click', useMainMapCenterInAdmin);
  els.admin.useLocationBtn.addEventListener('click', useLocationInAdmin);
  els.admin.fitScenarioBtn.addEventListener('click', fitScenarioInAdmin);
  els.admin.clearScenarioBtn.addEventListener('click', clearScenarioSpawns);
  els.admin.radiusInput.addEventListener('input', () => {
    syncAdminRangeLabels();
    renderAdminSpawnList();
  });
  els.admin.areaInput.addEventListener('input', () => setAdminAreaGuide(true));
  els.admin.areaInput.addEventListener('focus', () => setAdminAreaGuide(true));
  els.admin.areaInput.addEventListener('blur', () => setAdminAreaGuide(false));
  els.admin.autoSpreadBtn.addEventListener('mouseenter', () => setAdminAreaGuide(true));
  els.admin.autoSpreadBtn.addEventListener('mouseleave', () => setAdminAreaGuide(false));
  els.admin.autoSpreadBtn.addEventListener('focus', () => setAdminAreaGuide(true));
  els.admin.autoSpreadBtn.addEventListener('blur', () => setAdminAreaGuide(false));
  els.detail.closeBtn.addEventListener('click', closeCatchDetail);
  els.detail.modal.addEventListener('click', (event) => {
    if (event.target === els.detail.modal) closeCatchDetail();
  });
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
