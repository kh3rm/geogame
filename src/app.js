import { APP_VERSION, DEFAULT_CENTER, DEFAULT_SPAWNS, TILE_LAYER } from './config.js';
import { CREATURES, getCreature } from './creatures.js';
import { getAll, saveCustomSpawn, clear, replaceStores } from './db.js';
import { buildImportPreview, downloadBackup, mergeBackup, parseBackupFile, replaceBackup, shareBackup } from './backup.js';
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
  backupToggleBtn: $('backupToggleBtn'),
  backupMenuPanel: $('backupMenuPanel'),
  shareBackupBtn: $('shareBackupBtn'),
  downloadBackupBtn: $('downloadBackupBtn'),
  importBackupBtn: $('importBackupBtn'),
  backupFileInput: $('backupFileInput'),
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
};

const encounter = new EncounterController(els.encounter);

function randomCreatureId() {
  const ids = Object.keys(CREATURES);
  return ids[Math.floor(Math.random() * ids.length)];
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
    spawnLabel: record.spawnLabel || spawn?.label || record.spawnId || 'Okänd zon',
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
    const spawnColor = caught ? '#c8ccd6' : spawn.source === 'custom' ? '#9ff6ce' : '#7cc9ff';
    const zone = L.circle([spawn.lat, spawn.lng], {
      radius: spawn.radiusM,
      color: spawnColor,
      fillColor: spawnColor,
      fillOpacity: 0.13,
      weight: 2,
    }).addTo(state.spawnLayer);

    const marker = L.circleMarker([spawn.lat, spawn.lng], {
      radius: 9,
      color: '#ffffff',
      fillColor: spawnColor,
      fillOpacity: 0.95,
      weight: 2,
    }).addTo(state.spawnLayer);

    marker.bindPopup(`
      <div class="spawn-popup">
        <strong>${creature.name}</strong><br />
        ${spawn.label}<br />
        Status: ${caught ? 'fångad' : 'ledig'}<br />
        Radie: ${spawn.radiusM} m
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
    const normalColor = spawn?.source === 'custom' ? '#9ff6ce' : '#7cc9ff';
    const color = caught ? '#c8ccd6' : normalColor;
    layers.zone.setStyle({
      fillOpacity: caught ? 0.08 : selectedOrActive ? 0.26 : 0.13,
      weight: selectedOrActive ? 4 : 2,
      color,
      fillColor: color,
    });
    layers.marker.setStyle({
      radius: selectedOrActive ? 12 : 9,
      fillColor: color,
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
    els.nearestName.textContent = 'Inga zoner finns';
    els.nearestDetails.textContent = 'Skapa en lokal testzon för att börja.';
    els.signalBadge.textContent = '0%';
    els.signalBar.style.width = '0%';
    els.encounterBtn.disabled = true;
    els.encounterBtn.textContent = 'Öppna kamerafångst';
    return;
  }

  const creature = getCreature(nearest.spawn.creatureId);
  const alreadyCaught = isSpawnCaught(nearest.spawn.id);
  els.nearestName.textContent = alreadyCaught
    ? `${creature.name} är redan fångad`
    : nearest.inside
      ? `${creature.name} är här`
      : `${creature.name}-signal`;
  els.nearestDetails.textContent = `${nearest.spawn.label}: ${formatDistance(nearest.distance)} bort. Zonradie: ${nearest.spawn.radiusM} m.`;
  els.signalBadge.textContent = `${nearest.signal}%`;
  els.signalBar.style.width = `${nearest.signal}%`;
  els.encounterBtn.disabled = !nearest.inside || alreadyCaught;
  els.encounterBtn.textContent = alreadyCaught ? 'Redan fångad i denna zon' : 'Öppna kamerafångst';

  const mode = state.simulated ? 'Simulering' : 'GPS';
  setStatus(alreadyCaught
    ? `${mode}: zonen är redan fångad`
    : nearest.inside
      ? `${mode}: fångst tillgänglig`
      : `${mode}: närmast ${formatDistance(nearest.distance)}`);
}

async function loadLocalData() {
  try {
    const [customSpawns, catches] = await Promise.all([
      getAll('customSpawns'),
      getAll('catches'),
    ]);
    state.spawns = [...DEFAULT_SPAWNS, ...customSpawns];
    const dedupedCatches = dedupeCatchesBySpawn(catches);
    if (dedupedCatches.length !== catches.length) {
      await replaceStores({ catches: dedupedCatches });
    }
    state.catches = dedupedCatches.sort((a, b) => b.caughtAt.localeCompare(a.caughtAt));
  } catch (error) {
    console.warn('IndexedDB unavailable or failed:', error);
    state.spawns = [...DEFAULT_SPAWNS];
    state.catches = [];
  }
}

function renderCollection() {
  els.catchCount.textContent = String(state.catches.length);
  if (state.catches.length === 0) {
    els.collectionList.innerHTML = '<p class="muted">Inget fångat än. Gå in i en geozon och öppna skannern.</p>';
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
    els.detail.location.textContent = `Position: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}${location.radiusM ? ` · zonradie ${Math.round(location.radiusM)} m` : ''}`;
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
  state.spawns.push(savedSpawn);
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
    <div class="restore-stat"><strong>${preview.newSpawns.length + preview.updatedSpawns.length}</strong><span>Egna zoner att lägga till/uppdatera</span></div>
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
      : 'Uppdatera zoner';
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
    setStatus(`Lade till ${result.catchesAdded} fångster`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Sammanfogning misslyckades');
  }
}

async function applyReplaceRestore() {
  if (!state.pendingRestore) return;
  const ok = window.confirm('Ersätta lokal sparfil? Det tar bort fångster och egna zoner på den här telefonen och återställer vald backup.');
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
    setStatus('Den här zonen är redan fångad');
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
