import { getAll, get, put, putMany, replaceStores } from './db.js';

export const BACKUP_APP_ID = 'geocritter-lens';
export const BACKUP_VERSION = 1;

function makeDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isoOrNull(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function recordTime(record) {
  return Date.parse(record.updatedAt || record.caughtAt || record.createdAt || '1970-01-01T00:00:00.000Z');
}

function dedupeCatchesBySpawn(catches) {
  const byKey = new Map();
  for (const record of normalizeArray(catches)) {
    const key = record.spawnId || record.id;
    const existing = byKey.get(key);
    if (!existing || recordTime(record) >= recordTime(existing)) byKey.set(key, record);
  }
  return [...byKey.values()];
}

export async function exportSave() {
  const [rawCatches, customSpawns, settings] = await Promise.all([
    getAll('catches'),
    getAll('customSpawns'),
    getAll('settings'),
  ]);

  const catches = dedupeCatchesBySpawn(rawCatches);

  return {
    app: BACKUP_APP_ID,
    saveVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    summary: {
      catches: catches.length,
      customSpawns: customSpawns.length,
    },
    data: {
      catches,
      customSpawns,
      settings,
    },
  };
}

export async function makeSaveFile() {
  const save = await exportSave();
  const json = JSON.stringify(save, null, 2);
  return new File(
    [json],
    `geocritter-save-${makeDateStamp()}.json`,
    { type: 'application/json' },
  );
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }
}

export async function downloadBackup() {
  const file = await makeSaveFile();
  downloadFile(file);
  await put('settings', { key: 'lastBackupAt', value: new Date().toISOString() });
  return { method: 'download', fileName: file.name };
}

export async function shareBackup() {
  const file = await makeSaveFile();
  const shareData = {
    title: 'GeoCritter-backup',
    text: 'GeoCritter-backupfil',
    files: [file],
  };

  const canShareFile =
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (typeof navigator.share === 'function' && canShareFile) {
    try {
      await navigator.share(shareData);
      await put('settings', { key: 'lastBackupAt', value: new Date().toISOString() });
      return { method: 'share', ok: true, fileName: file.name };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { method: 'share', ok: false, reason: 'cancelled', fileName: file.name };
      }
      console.warn('Delning misslyckades; laddar ned backup i stället.', error);
    }
  }

  downloadFile(file);
  await put('settings', { key: 'lastBackupAt', value: new Date().toISOString() });
  return { method: 'download', ok: true, reason: 'share-unavailable', fileName: file.name };
}

export async function parseBackupFile(file) {
  if (!file) return null;
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Den valda filen är inte giltig JSON.');
  }
  validateBackup(parsed);
  return parsed;
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('Backupfilen är tom eller ogiltig.');
  if (backup.app !== BACKUP_APP_ID) throw new Error('Det här är inte en GeoCritter Lens-backupfil.');
  if (backup.saveVersion !== BACKUP_VERSION) {
    throw new Error(`Backupversion ${backup.saveVersion} stöds inte. Förväntade version ${BACKUP_VERSION}.`);
  }
  if (!backup.data || typeof backup.data !== 'object') throw new Error('Backupfilen saknar datasektion.');

  const catches = normalizeArray(backup.data.catches);
  const customSpawns = normalizeArray(backup.data.customSpawns);
  const settings = normalizeArray(backup.data.settings);

  for (const record of catches) validateCatch(record);
  for (const spawn of customSpawns) validateCustomSpawn(spawn);
  for (const setting of settings) validateSetting(setting);

  return true;
}

function validateCatch(record) {
  if (!record || typeof record !== 'object') throw new Error('En fångstpost är ogiltig.');
  if (typeof record.id !== 'string' || record.id.length < 3) throw new Error('En fångstpost saknar id.');
  if (typeof record.creatureId !== 'string' || record.creatureId.length < 2) {
    throw new Error(`Fångst ${record.id} saknar creatureId.`);
  }
  if (!isoOrNull(record.caughtAt)) throw new Error(`Fångst ${record.id} har ett ogiltigt fångstdatum.`);
}

function validateCustomSpawn(spawn) {
  if (!spawn || typeof spawn !== 'object') throw new Error('En egen platspost är ogiltig.');
  if (typeof spawn.id !== 'string' || spawn.id.length < 3) throw new Error('En egen plats saknar id.');
  if (typeof spawn.creatureId !== 'string' || spawn.creatureId.length < 2) {
    throw new Error(`Egen plats ${spawn.id} saknar creatureId.`);
  }
  if (typeof spawn.lat !== 'number' || spawn.lat < -90 || spawn.lat > 90) {
    throw new Error(`Egen plats ${spawn.id} har ogiltig latitud.`);
  }
  if (typeof spawn.lng !== 'number' || spawn.lng < -180 || spawn.lng > 180) {
    throw new Error(`Egen plats ${spawn.id} har ogiltig longitud.`);
  }
  if (typeof spawn.radiusM !== 'number' || spawn.radiusM <= 0 || spawn.radiusM > 10000) {
    throw new Error(`Egen plats ${spawn.id} har ogiltigt fångstavstånd.`);
  }
}

function validateSetting(setting) {
  if (!setting || typeof setting !== 'object') throw new Error('En inställningspost är ogiltig.');
  if (typeof setting.key !== 'string' || !setting.key) throw new Error('En inställningspost saknar nyckel.');
}

export async function buildImportPreview(backup) {
  validateBackup(backup);
  const importedCatches = dedupeCatchesBySpawn(backup.data.catches);
  const importedSpawns = normalizeArray(backup.data.customSpawns);
  const importedSettings = normalizeArray(backup.data.settings);

  const newCatches = [];
  const duplicateCatches = [];
  const newSpawns = [];
  const duplicateSpawns = [];
  const updatedSpawns = [];

  const localCatches = await getAll('catches');
  const localCatchIds = new Set(localCatches.map((record) => record.id));
  const localSpawnIds = new Set(localCatches.map((record) => record.spawnId).filter(Boolean));
  const seenImportedSpawnIds = new Set();

  const importedScenarioSetting = importedSettings.find((setting) => setting?.key === 'adminScenarios');
  const importedScenarios = normalizeAdminScenarios(importedScenarioSetting?.value);
  const localScenarioSetting = await get('settings', 'adminScenarios');
  const localScenarios = new Map(normalizeAdminScenarios(localScenarioSetting?.value).map((scenario) => [scenario.id, scenario]));
  const scenariosToMerge = importedScenarios.filter((scenario) => {
    const local = localScenarios.get(scenario.id);
    return !local || recordTime(scenario) > recordTime(local);
  }).length;

  const importedCreatureSetting = importedSettings.find((setting) => setting?.key === 'customCreatures');
  const importedCreatures = normalizeCustomCreatures(importedCreatureSetting?.value);
  const localCreatureSetting = await get('settings', 'customCreatures');
  const localCreatures = new Map(normalizeCustomCreatures(localCreatureSetting?.value).map((creature) => [creature.id, creature]));
  const creaturesToMerge = importedCreatures.filter((creature) => {
    const local = localCreatures.get(creature.id);
    return !local || JSON.stringify(local) !== JSON.stringify(creature);
  }).length;

  for (const record of importedCatches) {
    const spawnKey = record.spawnId || null;
    if (
      localCatchIds.has(record.id) ||
      (spawnKey && localSpawnIds.has(spawnKey)) ||
      (spawnKey && seenImportedSpawnIds.has(spawnKey))
    ) {
      duplicateCatches.push(record);
    } else {
      newCatches.push(record);
      if (spawnKey) seenImportedSpawnIds.add(spawnKey);
    }
  }

  for (const spawn of importedSpawns) {
    const local = await get('customSpawns', spawn.id);
    if (!local) newSpawns.push(spawn);
    else if (recordTime(spawn) > recordTime(local)) updatedSpawns.push(spawn);
    else duplicateSpawns.push(spawn);
  }

  return {
    exportedAt: backup.exportedAt ?? null,
    newCatches,
    duplicateCatches,
    newSpawns,
    updatedSpawns,
    duplicateSpawns,
    importedTotals: {
      catches: importedCatches.length,
      customSpawns: importedSpawns.length,
      settings: importedSettings.length,
    },
    settingsToMerge: {
      scenarios: scenariosToMerge,
      customCreatures: creaturesToMerge,
    },
  };
}

function normalizeAdminScenarios(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((scenario) => scenario && typeof scenario.id === 'string' && scenario.id.length > 2);
}

async function mergeAdminScenarioSettings(importedSettings) {
  const importedScenarioSetting = normalizeArray(importedSettings).find((setting) => setting?.key === 'adminScenarios');
  const importedScenarios = normalizeAdminScenarios(importedScenarioSetting?.value);
  if (importedScenarios.length === 0) return 0;

  const localSetting = await get('settings', 'adminScenarios');
  const byId = new Map(normalizeAdminScenarios(localSetting?.value).map((scenario) => [scenario.id, scenario]));
  let changed = 0;

  for (const scenario of importedScenarios) {
    const existing = byId.get(scenario.id);
    if (!existing || recordTime(scenario) > recordTime(existing)) {
      byId.set(scenario.id, scenario);
      changed += 1;
    }
  }

  if (changed > 0) {
    await put('settings', {
      key: 'adminScenarios',
      value: [...byId.values()].sort((a, b) => recordTime(b) - recordTime(a)),
      updatedAt: new Date().toISOString(),
    });
  }

  return changed;
}

function normalizeCustomCreatures(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((creature) => creature && typeof creature.id === 'string' && creature.id.length > 1);
}

async function mergeCustomCreatureSettings(importedSettings) {
  const importedCreatureSetting = normalizeArray(importedSettings).find((setting) => setting?.key === 'customCreatures');
  const importedCreatures = normalizeCustomCreatures(importedCreatureSetting?.value);
  if (importedCreatures.length === 0) return 0;

  const localSetting = await get('settings', 'customCreatures');
  const byId = new Map(normalizeCustomCreatures(localSetting?.value).map((creature) => [creature.id, creature]));
  let changed = 0;

  for (const creature of importedCreatures) {
    const existing = byId.get(creature.id);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(creature)) {
      byId.set(creature.id, creature);
      changed += 1;
    }
  }

  if (changed > 0) {
    await put('settings', {
      key: 'customCreatures',
      value: [...byId.values()],
      updatedAt: new Date().toISOString(),
    });
  }

  return changed;
}

export async function mergeBackup(backup, preview = null) {
  validateBackup(backup);
  const diff = preview ?? await buildImportPreview(backup);

  const catchesToAdd = diff.newCatches;
  const spawnsToPut = [...diff.newSpawns, ...diff.updatedSpawns];
  const [scenariosMerged, creaturesMerged] = await Promise.all([
    mergeAdminScenarioSettings(backup.data.settings),
    mergeCustomCreatureSettings(backup.data.settings),
  ]);

  await Promise.all([
    catchesToAdd.length ? putMany('catches', catchesToAdd) : Promise.resolve(),
    spawnsToPut.length ? putMany('customSpawns', spawnsToPut) : Promise.resolve(),
    put('settings', {
      key: 'lastImportAt',
      value: new Date().toISOString(),
      mode: 'merge',
      sourceExportedAt: backup.exportedAt ?? null,
    }),
  ]);

  return {
    mode: 'merge',
    catchesAdded: catchesToAdd.length,
    spawnsAdded: diff.newSpawns.length,
    spawnsUpdated: diff.updatedSpawns.length,
    scenariosMerged,
    creaturesMerged,
    catchesSkipped: diff.duplicateCatches.length,
  };
}

export async function replaceBackup(backup) {
  validateBackup(backup);

  const current = await exportSave();
  try {
    await replaceStores({
      catches: dedupeCatchesBySpawn(backup.data.catches),
      customSpawns: normalizeArray(backup.data.customSpawns),
      settings: [
        ...normalizeArray(backup.data.settings),
        {
          key: 'lastImportAt',
          value: new Date().toISOString(),
          mode: 'replace',
          sourceExportedAt: backup.exportedAt ?? null,
        },
      ],
    });
  } catch (error) {
    console.error('Ersättning misslyckades. Försöker återställa tidigare sparfil.', error);
    await replaceStores({
      catches: normalizeArray(current.data.catches),
      customSpawns: normalizeArray(current.data.customSpawns),
      settings: normalizeArray(current.data.settings),
    });
    throw new Error('Återställningen misslyckades. Den tidigare lokala sparfilen återställdes.');
  }

  return {
    mode: 'replace',
    catchesRestored: normalizeArray(backup.data.catches).length,
    spawnsRestored: normalizeArray(backup.data.customSpawns).length,
  };
}
