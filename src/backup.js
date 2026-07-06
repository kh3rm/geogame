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

export async function exportSave() {
  const [catches, customSpawns, settings] = await Promise.all([
    getAll('catches'),
    getAll('customSpawns'),
    getAll('settings'),
  ]);

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
    title: 'GeoCritter save backup',
    text: 'GeoCritter save backup file',
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
      console.warn('Native sharing failed; using download fallback.', error);
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
    throw new Error('The selected file is not valid JSON.');
  }
  validateBackup(parsed);
  return parsed;
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('Backup file is empty or invalid.');
  if (backup.app !== BACKUP_APP_ID) throw new Error('This is not a GeoCritter Lens backup file.');
  if (backup.saveVersion !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${backup.saveVersion}. Expected version ${BACKUP_VERSION}.`);
  }
  if (!backup.data || typeof backup.data !== 'object') throw new Error('Backup data section is missing.');

  const catches = normalizeArray(backup.data.catches);
  const customSpawns = normalizeArray(backup.data.customSpawns);
  const settings = normalizeArray(backup.data.settings);

  for (const record of catches) validateCatch(record);
  for (const spawn of customSpawns) validateCustomSpawn(spawn);
  for (const setting of settings) validateSetting(setting);

  return true;
}

function validateCatch(record) {
  if (!record || typeof record !== 'object') throw new Error('A catch record is invalid.');
  if (typeof record.id !== 'string' || record.id.length < 3) throw new Error('A catch record is missing its id.');
  if (typeof record.creatureId !== 'string' || record.creatureId.length < 2) {
    throw new Error(`Catch ${record.id} is missing creatureId.`);
  }
  if (!isoOrNull(record.caughtAt)) throw new Error(`Catch ${record.id} has an invalid caughtAt date.`);
}

function validateCustomSpawn(spawn) {
  if (!spawn || typeof spawn !== 'object') throw new Error('A custom spawn record is invalid.');
  if (typeof spawn.id !== 'string' || spawn.id.length < 3) throw new Error('A custom spawn is missing its id.');
  if (typeof spawn.creatureId !== 'string' || spawn.creatureId.length < 2) {
    throw new Error(`Custom spawn ${spawn.id} is missing creatureId.`);
  }
  if (typeof spawn.lat !== 'number' || spawn.lat < -90 || spawn.lat > 90) {
    throw new Error(`Custom spawn ${spawn.id} has invalid latitude.`);
  }
  if (typeof spawn.lng !== 'number' || spawn.lng < -180 || spawn.lng > 180) {
    throw new Error(`Custom spawn ${spawn.id} has invalid longitude.`);
  }
  if (typeof spawn.radiusM !== 'number' || spawn.radiusM <= 0 || spawn.radiusM > 10000) {
    throw new Error(`Custom spawn ${spawn.id} has invalid radius.`);
  }
}

function validateSetting(setting) {
  if (!setting || typeof setting !== 'object') throw new Error('A setting record is invalid.');
  if (typeof setting.key !== 'string' || !setting.key) throw new Error('A setting record is missing its key.');
}

export async function buildImportPreview(backup) {
  validateBackup(backup);
  const importedCatches = normalizeArray(backup.data.catches);
  const importedSpawns = normalizeArray(backup.data.customSpawns);

  const newCatches = [];
  const duplicateCatches = [];
  const newSpawns = [];
  const duplicateSpawns = [];
  const updatedSpawns = [];

  for (const record of importedCatches) {
    const local = await get('catches', record.id);
    if (local) duplicateCatches.push(record);
    else newCatches.push(record);
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
      settings: normalizeArray(backup.data.settings).length,
    },
  };
}

export async function mergeBackup(backup, preview = null) {
  validateBackup(backup);
  const diff = preview ?? await buildImportPreview(backup);

  const catchesToAdd = diff.newCatches;
  const spawnsToPut = [...diff.newSpawns, ...diff.updatedSpawns];

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
    catchesSkipped: diff.duplicateCatches.length,
  };
}

export async function replaceBackup(backup) {
  validateBackup(backup);

  const current = await exportSave();
  try {
    await replaceStores({
      catches: normalizeArray(backup.data.catches),
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
    console.error('Replace failed. Attempting rollback.', error);
    await replaceStores({
      catches: normalizeArray(current.data.catches),
      customSpawns: normalizeArray(current.data.customSpawns),
      settings: normalizeArray(current.data.settings),
    });
    throw new Error('Restore failed. The previous local save was restored.');
  }

  return {
    mode: 'replace',
    catchesRestored: normalizeArray(backup.data.catches).length,
    spawnsRestored: normalizeArray(backup.data.customSpawns).length,
  };
}
