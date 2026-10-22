import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isFilePath, isRecord } from '../shared/ServiceResult.js';

const COLUMNS = ['record_id', 'image_path', 'raw_description', 'annotation'];
const operations = new Map();

export function resolveAnnotationDatasetPath(datasetPath) {
  if (
    !isFilePath(datasetPath) ||
    !path.isAbsolute(datasetPath) ||
    path.extname(datasetPath).toLowerCase() !== '.json'
  ) {
    throw new Error('注解需要有效的图集 JSON 绝对路径。');
  }
  return path.resolve(datasetPath);
}

export function getAnnotationDatasetKey(datasetPath) {
  const resolvedPath = resolveAnnotationDatasetPath(datasetPath);
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

async function inDatasetQueue(datasetPath, operation) {
  const key = getAnnotationDatasetKey(datasetPath);
  const queued = (operations.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  operations.set(key, queued);
  try {
    return await queued;
  } finally {
    if (operations.get(key) === queued) operations.delete(key);
  }
}

// A small strict CSV reader: quoted commas, escaped quotes and embedded CR/LF
// are data. Broken files must never be treated as an empty annotation store.
function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  const endField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
  };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (inQuotes) {
      if (char !== '"') field += char;
      else if (input[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        inQuotes = false;
        afterQuote = true;
      }
    } else if (char === ',') {
      endField();
    } else if (char === '\r' || char === '\n') {
      endField();
      rows.push(row);
      row = [];
      if (char === '\r' && input[index + 1] === '\n') index++;
    } else if (char === '"' && field === '' && !afterQuote) {
      inQuotes = true;
    } else {
      if (afterQuote || char === '"') throw new Error('注解 CSV 引号格式错误，已停止读取和保存。');
      field += char;
    }
  }
  if (inQuotes) throw new Error('注解 CSV 存在未闭合的引号，已停止读取和保存。');
  if (field !== '' || afterQuote || row.length > 0) {
    endField();
    rows.push(row);
  }
  const header = rows.shift();
  if (!header || header.length !== COLUMNS.length || !COLUMNS.every((column, index) => column === header[index])) {
    throw new Error('注解 CSV 表头不匹配，已停止读取和保存。');
  }
  return rows;
}

function serializeCsv(records) {
  const quote = value => `"${value.replace(/"/g, '""')}"`;
  const rows = records
    .filter(record => record.saved !== null)
    .map(record => [record.recordId, record.imagePath, record.saved.rawDescription, record.saved.annotation]);
  return `\uFEFF${COLUMNS.join(',')}\r\n${rows.map(row => row.map(quote).join(',') + '\r\n').join('')}`;
}

async function readSnapshot(datasetPath) {
  const jsonText = await fs.readFile(datasetPath, 'utf8');
  let dataset;
  try {
    dataset = JSON.parse(jsonText.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('无法解析图集 JSON，未读取或保存注解。');
  }
  if (!Array.isArray(dataset?.Picture) || !dataset.Picture.every(picture => isFilePath(picture?.['Image Source']))) {
    throw new Error('图集缺少有效的 Picture 数组或图片路径，请先在应用中正确加载图集。');
  }

  const imagePaths = dataset.Picture.map(picture => picture['Image Source'].replace(/\\/g, '/'));
  // Quad coordinates, No. and other editable standard answers are deliberately
  // excluded. A changed ordered path list invalidates all prior bindings.
  const fingerprint = createHash('sha256').update(JSON.stringify(imagePaths)).digest('hex');
  const records = imagePaths.map((imagePath, imageIndex) => ({
    recordId: `v1:${fingerprint}:${imageIndex}`,
    imageIndex,
    imagePath,
    saved: null,
  }));
  const csvPath = datasetPath.slice(0, -path.extname(datasetPath).length) + '.annotations.csv';
  let csvText;
  try {
    csvText = await fs.readFile(csvPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { datasetPath, csvPath, records };
  }

  const byId = new Map(records.map(record => [record.recordId, record]));
  for (const row of parseCsv(csvText)) {
    if (row.length !== COLUMNS.length) throw new Error('注解 CSV 数据列数不正确，已停止读取和保存。');
    const [recordId, imagePath, rawDescription, annotation] = row;
    const record = byId.get(recordId);
    if (!record || record.imagePath !== imagePath) {
      throw new Error('注解 CSV 与当前图集的图片列表不匹配；请核对原图集和 CSV，未自动重新关联或覆盖。');
    }
    if (record.saved !== null) throw new Error('注解 CSV 存在重复记录，已停止读取和保存。');
    if (!rawDescription.trim()) throw new Error('注解 CSV 存在空的人工描述，已停止读取和保存。');
    record.saved = { rawDescription, annotation };
  }
  return { datasetPath, csvPath, records };
}

export async function loadAnnotations(datasetPath) {
  const resolvedPath = resolveAnnotationDatasetPath(datasetPath);
  return inDatasetQueue(resolvedPath, () => readSnapshot(resolvedPath));
}

export async function saveAnnotation(datasetPath, recordId, result) {
  const resolvedPath = resolveAnnotationDatasetPath(datasetPath);
  if (
    typeof recordId !== 'string' ||
    !recordId ||
    !isRecord(result) ||
    result.completed !== true ||
    typeof result.rawDescription !== 'string' ||
    !result.rawDescription.trim() ||
    typeof result.annotation !== 'string'
  ) {
    throw new Error('只能保存带有原始描述且已成功完成的注解。');
  }
  // Snapshot the caller's strings before waiting behind another write.
  const saved = { rawDescription: result.rawDescription, annotation: result.annotation };
  return inDatasetQueue(resolvedPath, async () => {
    // Reread inside the queue so concurrent records never overwrite each other.
    const snapshot = await readSnapshot(resolvedPath);
    const record = snapshot.records.find(item => item.recordId === recordId);
    if (!record) throw new Error('请求对应的图片记录已变化，请重新加载图集后重试。');
    record.saved = saved;
    const temporaryPath = path.join(
      path.dirname(snapshot.csvPath),
      `.${path.basename(snapshot.csvPath)}.${randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporaryPath, serializeCsv(snapshot.records), { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporaryPath, snapshot.csvPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => {});
      throw error;
    }
    return { datasetPath: resolvedPath, csvPath: snapshot.csvPath, record };
  });
}
