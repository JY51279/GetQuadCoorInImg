import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAnnotations, saveAnnotation } from '../src/main/AnnotationStore.js';
import { generateAndSaveAnnotation } from '../src/main/AnnotationWorkflow.js';

const temporaryDirectories = [];
const HEADER = '\uFEFFimage_path,raw_description,annotation\r\n';
const completed = (rawDescription, annotation = '') => ({ completed: true, rawDescription, annotation });

async function createDataset(imagePaths, csvText = null) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-annotation-test-'));
  temporaryDirectories.push(directory);
  const datasetPath = path.join(directory, 'A.json');
  await writeDataset(datasetPath, imagePaths);
  if (csvText !== null) await fs.writeFile(path.join(directory, 'A.annotations.csv'), csvText, 'utf8');
  return { datasetPath, csvPath: path.join(directory, 'A.annotations.csv') };
}

function writeDataset(datasetPath, imagePaths) {
  const Picture = imagePaths.map((imagePath, index) => ({ 'No.': index + 1, 'Image Source': imagePath }));
  return fs.writeFile(datasetPath, JSON.stringify({ Picture }), 'utf8');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Annotation store', () => {
  it('binds rows by image path and round-trips CSV-sensitive text', async () => {
    const { datasetPath, csvPath } = await createDataset(['img\\a.jpg', 'img/b.jpg']);
    const raw = '左边,"码"\n有拖影';
    await saveAnnotation(datasetPath, 'img/b.jpg', completed(raw, '左侧码区存在拖影。'));
    await saveAnnotation(datasetPath, 'img/a.jpg', completed('整张图片没有异常。'));

    expect(await fs.readFile(csvPath, 'utf8')).toBe(
      `${HEADER}"img/a.jpg","整张图片没有异常。",""\r\n"img/b.jpg","左边,""码""\n有拖影","左侧码区存在拖影。"\r\n`,
    );
    const { records } = await loadAnnotations(datasetPath);
    expect(records).toEqual([
      { imageIndex: 0, imagePath: 'img/a.jpg', saved: { rawDescription: '整张图片没有异常。', annotation: '' } },
      { imageIndex: 1, imagePath: 'img/b.jpg', saved: { rawDescription: raw, annotation: '左侧码区存在拖影。' } },
    ]);
  });

  it('keeps annotations attached after the dataset is reordered or extended', async () => {
    const { datasetPath } = await createDataset(['a.jpg', 'b.jpg']);
    await saveAnnotation(datasetPath, 'b.jpg', completed('反光'));
    await writeDataset(datasetPath, ['c.jpg', 'b.jpg', 'a.jpg']);

    const { records } = await loadAnnotations(datasetPath);
    expect(records.map(record => [record.imagePath, record.saved?.rawDescription ?? null])).toEqual([
      ['c.jpg', null],
      ['b.jpg', '反光'],
      ['a.jpg', null],
    ]);
  });

  it('updates the existing row instead of appending another one', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg']);
    await saveAnnotation(datasetPath, 'a.jpg', completed('旧描述'));
    await saveAnnotation(datasetPath, 'a.jpg', completed('新描述'));
    expect(await fs.readFile(csvPath, 'utf8')).toBe(`${HEADER}"a.jpg","新描述",""\r\n`);
  });

  it.each([
    ['identical paths', ['img/a.jpg', 'img/a.jpg']],
    ['separator and dot segments', ['img/a.jpg', '.\\img\\..\\img\\a.jpg']],
    ['relative and absolute forms', ['a.jpg', null]],
  ])('rejects datasets whose image paths resolve to the same file: %s', async (_name, imagePaths) => {
    const { datasetPath } = await createDataset(['placeholder.jpg']);
    const resolvedPaths = imagePaths.map(value => value ?? path.join(path.dirname(datasetPath), 'a.jpg'));
    await writeDataset(datasetPath, resolvedPaths);
    await expect(loadAnnotations(datasetPath)).rejects.toThrow('图集第 1 张与第 2 张图片路径重复');
    await expect(saveAnnotation(datasetPath, 'a.jpg', completed('反光'))).rejects.toThrow('图片路径重复');
  });

  it.runIf(process.platform === 'win32')('treats paths differing only in case as duplicates on Windows', async () => {
    const { datasetPath } = await createDataset(['img/a.jpg', 'IMG/A.JPG']);
    await expect(loadAnnotations(datasetPath)).rejects.toThrow('图片路径重复');
  });

  it('refuses to read or save when CSV rows have no matching image path, leaving the file intact', async () => {
    const csvText = `${HEADER}"a.jpg","反光",""\r\n"gone.jpg","拖影",""\r\n`;
    const { datasetPath, csvPath } = await createDataset(['a.jpg', 'b.jpg'], csvText);

    await expect(loadAnnotations(datasetPath)).rejects.toThrow('1 条记录的图片路径不在当前图集中（如 gone.jpg）');
    await expect(saveAnnotation(datasetPath, 'b.jpg', completed('模糊'))).rejects.toThrow('不在当前图集中');
    expect(await fs.readFile(csvPath, 'utf8')).toBe(csvText);
  });

  it.each([
    ['legacy header', '\uFEFFrecord_id,image_path,raw_description,annotation\r\n', '表头不匹配'],
    ['duplicate rows', `${HEADER}"a.jpg","反光",""\r\n"./a.jpg","拖影",""\r\n`, '重复记录'],
    ['empty image path', `${HEADER}"","反光",""\r\n`, '空的图片路径'],
    ['wrong column count', `${HEADER}"a.jpg","反光"\r\n`, '列数不正确'],
  ])('rejects invalid CSV content: %s', async (_name, csvText, message) => {
    const { datasetPath } = await createDataset(['a.jpg'], csvText);
    await expect(loadAnnotations(datasetPath)).rejects.toThrow(message);
  });

  it('rejects saves for an image path that is not in the dataset', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg']);
    await expect(saveAnnotation(datasetPath, 'b.jpg', completed('反光'))).rejects.toThrow('不在当前图集中');
    await expect(fs.access(csvPath)).rejects.toThrow();
  });
});

describe('Annotation workflow', () => {
  const normalize = async text => ({ success: true, completed: true, annotation: `规范：${text}`, usage: null });

  it('saves the generated annotation to the requested image path', async () => {
    const { datasetPath } = await createDataset(['a.jpg', 'b.jpg']);
    const stages = [];
    const result = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'b.jpg', text: '反光' },
      { normalize, onStage: progress => stages.push(progress) },
    );

    expect(result).toMatchObject({
      success: true,
      imagePath: 'b.jpg',
      record: { imageIndex: 1, imagePath: 'b.jpg', saved: { rawDescription: '反光', annotation: '规范：反光' } },
    });
    expect(stages.map(progress => [progress.imagePath, progress.stage])).toEqual([
      ['b.jpg', 'generate'],
      ['b.jpg', 'save'],
    ]);
  });

  it('rejects a request without an image path', async () => {
    const result = await generateAndSaveAnnotation({ datasetPath: '/x/A.json', text: '反光' }, { normalize });
    expect(result).toMatchObject({ success: false, error: '请提供图片路径和非空人工描述。' });
  });

  it('rejects an unknown image path before calling the model', async () => {
    const { datasetPath } = await createDataset(['a.jpg']);
    let called = false;
    const result = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'b.jpg', text: '反光' },
      { normalize: async () => ((called = true), normalize('反光')) },
    );
    expect(result).toMatchObject({ success: false, stage: 'prepare' });
    expect(called).toBe(false);
  });

  it('rejects a concurrent request for the same image written in another path form', async () => {
    const { datasetPath } = await createDataset(['img/a.jpg']);
    let release;
    const slowNormalize = () => new Promise(resolve => (release = () => resolve(normalize('反光'))));
    const first = generateAndSaveAnnotation(
      { datasetPath, imagePath: 'img/a.jpg', text: '反光' },
      { normalize: slowNormalize },
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'img\\a.jpg', text: '拖影' },
      { normalize },
    );
    expect(second).toMatchObject({ success: false, error: '该图片记录正在生成或保存注解，请等待完成。' });
    release();
    expect(await first).toMatchObject({ success: true });
  });
});
