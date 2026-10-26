import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAnnotations, saveAnnotation } from '../src/main/AnnotationStore.js';
import { generateAndSaveAnnotation } from '../src/main/AnnotationWorkflow.js';

const temporaryDirectories = [];
const HEADER = '\uFEFFimage_path,input_source,raw_description,annotation\r\n';
const LEGACY_HEADER = '\uFEFFimage_path,raw_description,annotation\r\n';
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
  it('creates one empty CSV row per JSON image when annotations do not exist yet', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg', 'b.jpg']);

    const { records } = await loadAnnotations(datasetPath);
    expect(records.map(record => record.saved)).toEqual([null, null]);
    expect(await fs.readFile(csvPath, 'utf8')).toBe(`${HEADER}"a.jpg","","",""\r\n"b.jpg","","",""\r\n`);
  });

  it('binds rows by image path and round-trips CSV-sensitive text', async () => {
    const { datasetPath, csvPath } = await createDataset(['img\\a.jpg', 'img/b.jpg']);
    const raw = '左边,"码"\n有拖影';
    await saveAnnotation(datasetPath, 'img/b.jpg', completed(raw, '左侧码区存在拖影。'));
    await saveAnnotation(datasetPath, 'img/a.jpg', completed('整张图片没有异常。'));

    expect(await fs.readFile(csvPath, 'utf8')).toBe(
      `${HEADER}"img/a.jpg","text","整张图片没有异常。",""\r\n"img/b.jpg","text","左边,""码""\n有拖影","左侧码区存在拖影。"\r\n`,
    );
    const { records } = await loadAnnotations(datasetPath);
    expect(records).toEqual([
      {
        imageIndex: 0,
        imagePath: 'img/a.jpg',
        saved: { inputSource: 'text', rawDescription: '整张图片没有异常。', annotation: '' },
      },
      {
        imageIndex: 1,
        imagePath: 'img/b.jpg',
        saved: { inputSource: 'text', rawDescription: raw, annotation: '左侧码区存在拖影。' },
      },
    ]);
  });

  it('keeps annotations attached after the dataset is reordered or extended', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg', 'b.jpg']);
    await saveAnnotation(datasetPath, 'b.jpg', completed('反光'));
    await writeDataset(datasetPath, ['c.jpg', 'b.jpg', 'a.jpg']);

    const { records } = await loadAnnotations(datasetPath);
    expect(records.map(record => [record.imagePath, record.saved?.rawDescription ?? null])).toEqual([
      ['c.jpg', null],
      ['b.jpg', '反光'],
      ['a.jpg', null],
    ]);
    expect(await fs.readFile(csvPath, 'utf8')).toBe(
      `${HEADER}"c.jpg","","",""\r\n"b.jpg","text","反光",""\r\n"a.jpg","","",""\r\n`,
    );
  });

  it('updates the existing row instead of appending another one', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg']);
    await saveAnnotation(datasetPath, 'a.jpg', completed('旧描述'));
    await saveAnnotation(datasetPath, 'a.jpg', completed('新描述'));
    expect(await fs.readFile(csvPath, 'utf8')).toBe(`${HEADER}"a.jpg","text","新描述",""\r\n`);
  });

  it('persists image input with an empty raw description and distinguishes an empty completed annotation', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg', 'b.jpg']);
    await saveAnnotation(datasetPath, 'a.jpg', {
      completed: true,
      inputSource: 'image',
      rawDescription: '',
      annotation: '',
    });

    expect(await fs.readFile(csvPath, 'utf8')).toBe(`${HEADER}"a.jpg","image","",""\r\n"b.jpg","","",""\r\n`);
    const { records } = await loadAnnotations(datasetPath);
    expect(records[0].saved).toEqual({ inputSource: 'image', rawDescription: '', annotation: '' });
    expect(records[1].saved).toBeNull();
  });

  it('reads and upgrades an existing three-column CSV including empty rows', async () => {
    const csvText = `${LEGACY_HEADER}"a.jpg","反光","有反光。"\r\n"b.jpg","",""\r\n`;
    const { datasetPath, csvPath } = await createDataset(['a.jpg', 'b.jpg'], csvText);

    const { records } = await loadAnnotations(datasetPath);
    expect(records).toEqual([
      {
        imageIndex: 0,
        imagePath: 'a.jpg',
        saved: { inputSource: 'text', rawDescription: '反光', annotation: '有反光。' },
      },
      { imageIndex: 1, imagePath: 'b.jpg', saved: null },
    ]);
    expect(await fs.readFile(csvPath, 'utf8')).toBe(
      `${HEADER}"a.jpg","text","反光","有反光。"\r\n"b.jpg","","",""\r\n`,
    );
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

  it('moves unmatched rows to the end, preserves them on save, and restores them if JSON adds the path', async () => {
    const csvText = `${LEGACY_HEADER}"gone.jpg","拖影",""\r\n"a.jpg","反光",""\r\n"old.jpg","污损",""\r\n`;
    const { datasetPath, csvPath } = await createDataset(['a.jpg', 'b.jpg'], csvText);

    const { records } = await loadAnnotations(datasetPath);
    expect(records.map(record => record.saved?.rawDescription ?? null)).toEqual(['反光', null]);
    expect(await fs.readFile(csvPath, 'utf8')).toBe(
      `${HEADER}"a.jpg","text","反光",""\r\n"b.jpg","","",""\r\n"gone.jpg","text","拖影",""\r\n"old.jpg","text","污损",""\r\n`,
    );

    await saveAnnotation(datasetPath, 'b.jpg', completed('模糊'));
    expect(await fs.readFile(csvPath, 'utf8')).toContain(
      '"b.jpg","text","模糊",""\r\n"gone.jpg","text","拖影",""\r\n"old.jpg","text","污损",""\r\n',
    );

    await writeDataset(datasetPath, ['gone.jpg', 'a.jpg', 'b.jpg']);
    const restored = await loadAnnotations(datasetPath);
    expect(restored.records.map(record => record.saved?.rawDescription ?? null)).toEqual(['拖影', '反光', '模糊']);
    expect(await fs.readFile(csvPath, 'utf8')).toBe(
      `${HEADER}"gone.jpg","text","拖影",""\r\n"a.jpg","text","反光",""\r\n"b.jpg","text","模糊",""\r\n"old.jpg","text","污损",""\r\n`,
    );
  });

  it.each([
    ['legacy header', '\uFEFFrecord_id,image_path,raw_description,annotation\r\n', '表头不匹配'],
    ['duplicate rows', `${HEADER}"a.jpg","text","反光",""\r\n"./a.jpg","text","拖影",""\r\n`, '重复记录'],
    ['annotation without description', `${HEADER}"a.jpg","text","","反光"\r\n`, '空的人工描述'],
    ['empty image path', `${HEADER}"","text","反光",""\r\n`, '空的图片路径'],
    ['wrong column count', `${HEADER}"a.jpg","text","反光"\r\n`, '列数不正确'],
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
  const normalize = async text => ({
    success: true,
    status: 'final',
    completed: true,
    annotation: `规范：${text}`,
    usage: null,
  });

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
      record: {
        imageIndex: 1,
        imagePath: 'b.jpg',
        saved: { inputSource: 'text', rawDescription: '反光', annotation: '规范：反光' },
      },
    });
    expect(stages.map(progress => [progress.imagePath, progress.stage])).toEqual([
      ['b.jpg', 'generate'],
      ['b.jpg', 'save'],
    ]);
  });

  it('returns feedback without saving or overwriting the previous annotation', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg']);
    await saveAnnotation(datasetPath, 'a.jpg', completed('旧描述', '旧注解'));
    const before = await fs.readFile(csvPath, 'utf8');
    const questions = [
      {
        id: 'q1',
        purpose: 'refine',
        prompt: '能否细化？',
        selection: 'single',
        options: [{ id: 'keep', label: '保持原描述' }],
      },
    ];
    const stages = [];
    const result = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'a.jpg', text: '新描述' },
      {
        normalize: async () => ({ success: true, status: 'needs_feedback', questions, usage: null }),
        onStage: progress => stages.push(progress.stage),
      },
    );

    expect(result).toMatchObject({ success: true, status: 'needs_feedback', questions, stage: 'generate' });
    expect(stages).toEqual(['generate']);
    expect(await fs.readFile(csvPath, 'utf8')).toBe(before);
  });

  it('forwards feedback history for the requested record', async () => {
    const { datasetPath } = await createDataset(['a.jpg']);
    const feedbackTurns = [
      {
        questions: [
          {
            id: 'q1',
            purpose: 'refine',
            prompt: '能否细化？',
            selection: 'single',
            options: [{ id: 'keep', label: '保持原描述' }],
          },
        ],
        answers: [{ questionId: 'q1', optionIds: ['keep'], text: '' }],
        message: '',
      },
    ];
    let received;
    await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'a.jpg', text: '右码模糊', feedbackTurns },
      {
        normalize: async (text, options) => {
          received = { text, feedbackTurns: options.feedbackTurns };
          return { success: true, status: 'final', completed: false, annotation: '' };
        },
      },
    );
    expect(received).toEqual({ text: '右码模糊', feedbackTurns });
  });

  it('loads the same visual regions, forwards feedback, and saves an image-source final result', async () => {
    const { datasetPath } = await createDataset(['a.jpg']);
    const regionReferences = [{ regionIndex: 0, label: '区域 1（左上）', position: '左上', url: 'quad-image://one' }];
    const loadedRegions = [
      {
        regionIndex: 0,
        label: '区域 1（左上）',
        position: '左上',
        imageUrl: 'data:image/png;base64,aQ==',
      },
    ];
    const feedbackTurns = [
      {
        questions: [
          {
            id: 'q1',
            purpose: 'refine',
            prompt: '是否保持模糊描述？',
            selection: 'single',
            options: [{ id: 'keep', label: '保持' }],
          },
        ],
        answers: [{ questionId: 'q1', optionIds: ['keep'], text: '' }],
        message: '',
      },
    ];
    let received;
    const result = await generateAndSaveAnnotation(
      {
        datasetPath,
        imagePath: 'a.jpg',
        inputSource: 'image',
        regions: regionReferences,
        feedbackTurns,
      },
      {
        loadRegions: async (regions, expectedImagePath) => {
          expect(regions).toEqual(regionReferences);
          expect(expectedImagePath).toBe(path.join(path.dirname(datasetPath), 'a.jpg'));
          return loadedRegions;
        },
        normalizeVisual: async (regions, options) => {
          received = { regions, feedbackTurns: options.feedbackTurns };
          return { success: true, status: 'final', completed: true, annotation: '区域 1（左上）存在模糊。' };
        },
      },
    );

    expect(received).toEqual({ regions: loadedRegions, feedbackTurns });
    expect(result.record.saved).toEqual({
      inputSource: 'image',
      rawDescription: '',
      annotation: '区域 1（左上）存在模糊。',
    });
  });

  it('returns an incomplete final result without saving', async () => {
    const { datasetPath, csvPath } = await createDataset(['a.jpg']);
    await saveAnnotation(datasetPath, 'a.jpg', completed('旧描述', '旧注解'));
    const before = await fs.readFile(csvPath, 'utf8');
    const result = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'a.jpg', text: '新描述' },
      { normalize: async () => ({ success: true, status: 'final', completed: false, annotation: '', usage: null }) },
    );

    expect(result).toMatchObject({ success: true, status: 'final', completed: false, stage: 'generate' });
    expect(await fs.readFile(csvPath, 'utf8')).toBe(before);
  });

  it('identifies an unexpected model-service exception as a generation failure', async () => {
    const { datasetPath } = await createDataset(['a.jpg']);
    const result = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'a.jpg', text: '玻璃幕墙。' },
      {
        normalize: async () => {
          throw new Error('unexpected provider failure');
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      stage: 'generate',
      error: '生成注解失败，请重试；若仍失败，请检查模型服务配置。',
    });
  });

  it('rejects a request without an image path', async () => {
    const result = await generateAndSaveAnnotation({ datasetPath: '/x/A.json', text: '反光' }, { normalize });
    expect(result).toMatchObject({ success: false, error: '请提供图片路径及有效的文字或图像输入。' });
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
    let markStarted;
    const started = new Promise(resolve => (markStarted = resolve));
    const slowNormalize = () =>
      new Promise(resolve => {
        release = () => resolve(normalize('反光'));
        markStarted();
      });
    const first = generateAndSaveAnnotation(
      { datasetPath, imagePath: 'img/a.jpg', text: '反光' },
      { normalize: slowNormalize },
    );
    await started;
    const second = await generateAndSaveAnnotation(
      { datasetPath, imagePath: 'img\\a.jpg', text: '拖影' },
      { normalize },
    );
    expect(second).toMatchObject({ success: false, error: '该图片记录正在生成或保存注解，请等待完成。' });
    release();
    expect(await first).toMatchObject({ success: true });
  });
});
