import fs from 'fs';
import path from 'path';

let jsonTempFileCounter = 0;
let lastJsonDirectory = '';
let dialogPathSettingsFile = '';
let documentsDirectory = '';
let homeDirectory = '';

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

  try {
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
  dialogPathSettingsFile = path.join(electronApp.getPath('userData'), 'dialog-paths.json');

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
