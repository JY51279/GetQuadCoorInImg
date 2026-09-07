import fs from 'fs';
import path from 'path';

export const LOSSY_REPAIR_BACKUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let jsonTempFileCounter = 0;
let jsonBackupFileCounter = 0;
let lastJsonDirectory = '';
let dialogPathSettingsFile = '';
let lossyRepairBackupDirectory = '';
let documentsDirectory = '';
let homeDirectory = '';

async function removeBackupFile(backupPath) {
  try {
    await fs.promises.unlink(backupPath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to remove expired JSON backup:', error);
  }
}

async function cleanupExpiredLossyRepairBackups(referenceTime = Date.now()) {
  if (!lossyRepairBackupDirectory) return;

  const entries = await fs.promises.readdir(lossyRepairBackupDirectory, { withFileTypes: true });
  const expirationThreshold = referenceTime - LOSSY_REPAIR_BACKUP_RETENTION_MS;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.bak')) continue;

    const backupPath = path.join(lossyRepairBackupDirectory, entry.name);
    try {
      const stats = await fs.promises.stat(backupPath);
      if (stats.mtimeMs <= expirationThreshold) await removeBackupFile(backupPath);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Failed to inspect JSON backup:', error);
    }
  }
}

function scheduleBackupCleanup(backupPath) {
  const timer = setTimeout(() => {
    void removeBackupFile(backupPath);
  }, LOSSY_REPAIR_BACKUP_RETENTION_MS);
  timer.unref?.();
}

async function createLossyRepairBackup(filePath) {
  if (!lossyRepairBackupDirectory) {
    throw new Error('Lossy repair backup storage is not initialized.');
  }

  await cleanupExpiredLossyRepairBackups();
  const fileName = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    lossyRepairBackupDirectory,
    `${fileName}.before-lossy-repair.${timestamp}.${++jsonBackupFileCounter}.bak`,
  );
  await fs.promises.copyFile(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  const createdAt = new Date();
  await fs.promises.utimes(backupPath, createdAt, createdAt);
  scheduleBackupCleanup(backupPath);
  return backupPath;
}

export async function saveJsonFileAtomically(data) {
  if (!data || typeof data.path !== 'string' || data.path.length === 0) {
    throw new Error('Invalid JSON file path.');
  }
  if (typeof data.str !== 'string') {
    throw new Error('Invalid JSON content.');
  }

  JSON.parse(data.str);

  const filePath = data.path;
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(directory, `.${fileName}.${process.pid}.${Date.now()}.${++jsonTempFileCounter}.tmp`);
  let backupPath = '';

  try {
    if (data.backupOriginal === true) {
      backupPath = await createLossyRepairBackup(filePath);
    }
    await fs.promises.writeFile(tempFilePath, data.str, 'utf-8');
    await fs.promises.rename(tempFilePath, filePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempFilePath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        console.error('Failed to remove temporary JSON file:', cleanupError);
      }
    }
    throw error;
  }

  return { backupPath };
}

function getExistingDirectory(directoryPath) {
  if (typeof directoryPath !== 'string' || directoryPath.length === 0) return '';
  try {
    return fs.statSync(directoryPath).isDirectory() ? directoryPath : '';
  } catch {
    return '';
  }
}

export async function initializeFileOperations(electronApp) {
  lastJsonDirectory = '';
  documentsDirectory = electronApp.getPath('documents');
  homeDirectory = electronApp.getPath('home');
  const userDataDirectory = electronApp.getPath('userData');
  dialogPathSettingsFile = path.join(userDataDirectory, 'dialog-paths.json');
  lossyRepairBackupDirectory = path.join(userDataDirectory, 'lossy-repair-backups');
  await fs.promises.mkdir(lossyRepairBackupDirectory, { recursive: true });
  await cleanupExpiredLossyRepairBackups();

  try {
    const settingsText = await fs.promises.readFile(dialogPathSettingsFile, 'utf-8');
    const settings = JSON.parse(settingsText);
    lastJsonDirectory = getExistingDirectory(settings.lastJsonDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to load dialog path settings:', error.message);
  }
}

export function getDefaultDialogDirectory() {
  return (
    getExistingDirectory(lastJsonDirectory) ||
    getExistingDirectory(documentsDirectory) ||
    getExistingDirectory(homeDirectory) ||
    homeDirectory
  );
}

async function saveDialogPathSettings() {
  if (!dialogPathSettingsFile) return;
  await saveJsonFileAtomically({
    path: dialogPathSettingsFile,
    str: JSON.stringify({ lastJsonDirectory }, null, 2),
  });
}

export async function rememberJsonDirectory(jsonFilePath) {
  lastJsonDirectory = path.dirname(jsonFilePath);
  await saveDialogPathSettings();
}

export function resolveJsonImagePath(imagePath, jsonFilePath = '') {
  if (typeof imagePath !== 'string' || imagePath.length === 0) return '';
  if (path.isAbsolute(imagePath)) return path.normalize(imagePath);

  if (typeof jsonFilePath === 'string' && jsonFilePath.length > 0) {
    return path.resolve(path.dirname(jsonFilePath), imagePath);
  }
  return path.resolve(imagePath);
}

export function getImageDialogDefaultDirectory(context) {
  const jsonFilePath = typeof context?.jsonFilePath === 'string' ? context.jsonFilePath : '';
  const imagePath = typeof context?.imagePath === 'string' ? context.imagePath : '';
  const resolvedImagePath = resolveJsonImagePath(imagePath, jsonFilePath);
  const imageDirectory = resolvedImagePath ? getExistingDirectory(path.dirname(resolvedImagePath)) : '';
  const jsonDirectory = jsonFilePath ? getExistingDirectory(path.dirname(jsonFilePath)) : '';
  return imageDirectory || jsonDirectory || getDefaultDialogDirectory();
}

export async function readJsonFile(filePath) {
  const str = await fs.promises.readFile(filePath, 'utf-8');
  return {
    str,
    path: filePath,
    fileName: path.basename(filePath),
  };
}
