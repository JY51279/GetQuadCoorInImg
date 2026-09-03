import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getDefaultDialogDirectory,
  getImageDialogDefaultDirectory,
  initializeFileOperations,
  readJsonFile,
  rememberJsonDirectory,
  resolveJsonImagePath,
  saveJsonFileAtomically,
} from '../src/main/FileOperations.js';

const temporaryDirectories = [];

async function createTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-file-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Main-process file operations', () => {
  it('resolves paths and persists the most recent JSON directory', async () => {
    const root = await createTemporaryDirectory();
    const documents = path.join(root, 'documents');
    const userData = path.join(root, 'user-data');
    const datasetDirectory = path.join(root, 'dataset');
    await Promise.all([documents, userData, datasetDirectory].map(directory => fs.mkdir(directory)));

    await initializeFileOperations({
      getPath(name) {
        return { documents, home: root, userData }[name];
      },
    });
    expect(getDefaultDialogDirectory()).toBe(documents);

    const jsonPath = path.join(datasetDirectory, 'sample.json');
    expect(resolveJsonImagePath('../images/a.png', jsonPath)).toBe(path.resolve(datasetDirectory, '../images/a.png'));
    expect(resolveJsonImagePath(path.join(root, 'absolute.png'), jsonPath)).toBe(
      path.normalize(path.join(root, 'absolute.png')),
    );

    await rememberJsonDirectory(jsonPath);
    expect(getDefaultDialogDirectory()).toBe(datasetDirectory);
    expect(getImageDialogDefaultDirectory({ jsonFilePath: jsonPath })).toBe(datasetDirectory);

    const settings = JSON.parse(await fs.readFile(path.join(userData, 'dialog-paths.json'), 'utf-8'));
    expect(settings.lastJsonDirectory).toBe(datasetDirectory);
  });

  it('saves valid JSON atomically and never overwrites it with invalid JSON', async () => {
    const root = await createTemporaryDirectory();
    const jsonPath = path.join(root, 'sample.json');

    await saveJsonFileAtomically({ path: jsonPath, str: '{"value":1}' });
    await saveJsonFileAtomically({ path: jsonPath, str: '{"value":2}' });
    await expect(saveJsonFileAtomically({ path: jsonPath, str: '{invalid' })).rejects.toBeInstanceOf(SyntaxError);

    expect(JSON.parse(await fs.readFile(jsonPath, 'utf-8'))).toEqual({ value: 2 });
    expect(await readJsonFile(jsonPath)).toEqual({
      str: '{"value":2}',
      path: jsonPath,
      fileName: 'sample.json',
    });
    expect((await fs.readdir(root)).filter(fileName => fileName.endsWith('.tmp'))).toEqual([]);
  });

  it('does not leak the previous directory when file operations are initialized again', async () => {
    const firstRoot = await createTemporaryDirectory();
    const firstDataset = path.join(firstRoot, 'dataset');
    const firstUserData = path.join(firstRoot, 'user-data');
    await Promise.all([firstDataset, firstUserData].map(directory => fs.mkdir(directory)));
    await initializeFileOperations({
      getPath(name) {
        return { documents: firstRoot, home: firstRoot, userData: firstUserData }[name];
      },
    });
    await rememberJsonDirectory(path.join(firstDataset, 'sample.json'));

    const secondRoot = await createTemporaryDirectory();
    const secondDocuments = path.join(secondRoot, 'documents');
    const secondUserData = path.join(secondRoot, 'user-data');
    await Promise.all([secondDocuments, secondUserData].map(directory => fs.mkdir(directory)));
    await initializeFileOperations({
      getPath(name) {
        return { documents: secondDocuments, home: secondRoot, userData: secondUserData }[name];
      },
    });

    expect(getDefaultDialogDirectory()).toBe(secondDocuments);
  });
});
