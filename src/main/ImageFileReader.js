import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { BmpError, decode as decodeBmp, extractCompressedData } from '@nktkas/bmp';
import sharp from 'sharp';

export const IMAGE_PROTOCOL_SCHEME = 'quad-image';
export const MAX_DISPLAY_PIXELS = 8_000_000;
export const MAX_DISPLAY_DIMENSION = 4096;
export const MAX_INPUT_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 40_000_000;
const MAX_CACHE_BYTES = 512 * 1024 * 1024;
const BMP_MIN_HEADER_BYTES = 26;
const BMP_HEADER_READ_BYTES = 54;
const BMP_CORE_HEADER_SIZE = 12;
const BMP_OS2_HEADER_SIZES = new Set([16, 64]);

export const DIRECT_IMAGE_MIME_TYPES = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
});

const PNG_CONVERSION_EXTENSIONS = Object.freeze(['bmp', 'gif', 'webp', 'svg', 'tiff', 'tif', 'svgz']);
const SHARP_INPUT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'tiff', 'tif', 'svgz']);
export const IMAGE_EXTENSIONS = Object.freeze([
  ...new Set([...Object.keys(DIRECT_IMAGE_MIME_TYPES), ...PNG_CONVERSION_EXTENSIONS]),
]);

let imageCacheDirectory = '';
let nativeImageApi = null;
let cacheTempCounter = 0;
const imageAssets = new Map();

export function calculateDisplaySize(
  width,
  height,
  { maxPixels = MAX_DISPLAY_PIXELS, maxDimension = MAX_DISPLAY_DIMENSION } = {},
) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error('图片尺寸无效。');
  }
  if (!Number.isSafeInteger(maxPixels) || maxPixels <= 0 || !Number.isSafeInteger(maxDimension) || maxDimension <= 0) {
    throw new Error('图片显示尺寸限制无效。');
  }

  const dimensionScale = Math.min(maxDimension / width, maxDimension / height);
  const pixelScale = Math.sqrt(maxPixels / (width * height));
  const scale = Math.min(1, dimensionScale, pixelScale);
  const minimumWidth = width > 1 ? 2 : 1;
  const minimumHeight = height > 1 ? 2 : 1;
  const scaledWidth = Math.floor(width * scale);
  const scaledHeight = Math.floor(height * scale);
  const displaySize = {
    width: Math.max(minimumWidth, scaledWidth),
    height: Math.max(minimumHeight, scaledHeight),
  };

  if (displaySize.width * displaySize.height > maxPixels && scaledWidth < minimumWidth) {
    displaySize.height = Math.max(minimumHeight, Math.floor(maxPixels / displaySize.width));
  }
  if (displaySize.width * displaySize.height > maxPixels && scaledHeight < minimumHeight) {
    displaySize.width = Math.max(minimumWidth, Math.floor(maxPixels / displaySize.height));
  }
  if (
    displaySize.width > maxDimension ||
    displaySize.height > maxDimension ||
    displaySize.width * displaySize.height > maxPixels
  ) {
    throw new Error('图片显示尺寸限制过小，无法保留可编辑坐标。');
  }
  return displaySize;
}

export function calculateCoordinateScale(originalSize, displaySize) {
  if (
    !Number.isSafeInteger(originalSize) ||
    originalSize <= 0 ||
    !Number.isSafeInteger(displaySize) ||
    displaySize <= 0
  ) {
    throw new Error('坐标尺寸无效。');
  }
  if (originalSize === displaySize) return 1;
  if (originalSize <= 1 || displaySize <= 1) {
    throw new Error('仅剩一个端点时无法保留可编辑坐标。');
  }
  return (displaySize - 1) / (originalSize - 1);
}

function getOrientedDimensions(metadata) {
  const shouldSwapAxes = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: shouldSwapAxes ? metadata.height : metadata.width,
    height: shouldSwapAxes ? metadata.width : metadata.height,
  };
}

function validateInputDimensions(width, height) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error('图片尺寸无效。');
  }
  if (width > Math.floor(MAX_INPUT_PIXELS / height)) {
    throw new Error('图片像素数量超过 4000 万限制。');
  }
}

function validateBmpFileLayout(header, fileSize, headerSize, width, height) {
  const dataOffset = header.readUInt32LE(10);
  const bitsPerPixel = header.readUInt16LE(headerSize === BMP_CORE_HEADER_SIZE ? 24 : 28);
  const hasCompressionFields = headerSize === 64 || headerSize >= 40;
  const compression = hasCompressionFields ? header.readUInt32LE(30) : 0;
  const imageSize = hasCompressionFields ? header.readUInt32LE(34) : 0;
  let minimumDataOffset = 14 + headerSize;
  if (headerSize === 40 && compression === 3 && bitsPerPixel !== 1) minimumDataOffset += 12;
  if (headerSize === 40 && compression === 6) minimumDataOffset += 16;
  if (fileSize < minimumDataOffset || dataOffset < minimumDataOffset || dataOffset > fileSize) {
    throw new Error('BMP 图片文件布局无效。');
  }

  const isModifiedHuffman = compression === 3 && bitsPerPixel === 1;
  const hasFixedSizePixelData = compression === 0 || (compression === 3 && !isModifiedHuffman) || compression === 6;

  let minimumFileSize;
  if (hasFixedSizePixelData) {
    if (bitsPerPixel === 0) throw new Error('BMP 图片位深无效。');
    const rowStride = Math.ceil((width * bitsPerPixel) / 32) * 4;
    minimumFileSize = dataOffset + rowStride * height;
  } else {
    if (imageSize === 0) throw new Error('BMP 压缩数据长度无效。');
    minimumFileSize = dataOffset + imageSize;
  }

  if (!Number.isSafeInteger(minimumFileSize) || minimumFileSize > fileSize) {
    throw new Error('BMP 图片像素数据不完整。');
  }
}

async function getBmpDescription(filePath, fileSize) {
  const header = Buffer.alloc(BMP_HEADER_READ_BYTES);
  const file = await fs.promises.open(filePath, 'r');
  let bytesRead = 0;
  try {
    ({ bytesRead } = await file.read(header, 0, header.length, 0));
  } finally {
    await file.close();
  }

  if (bytesRead < BMP_MIN_HEADER_BYTES || header.readUInt16LE(0) !== 0x4d42) {
    throw new Error('BMP 图片文件头无效。');
  }

  const headerSize = header.readUInt32LE(14);
  let width;
  let height;
  if (headerSize === BMP_CORE_HEADER_SIZE) {
    width = header.readUInt16LE(18);
    height = header.readUInt16LE(20);
  } else if (BMP_OS2_HEADER_SIZES.has(headerSize) || headerSize >= 40) {
    const minimumHeaderBytes = headerSize === 16 ? 30 : 38;
    if (bytesRead < minimumHeaderBytes) throw new Error('BMP 图片文件头无效。');
    width = Math.abs(header.readInt32LE(18));
    height = Math.abs(header.readInt32LE(22));
  } else {
    throw new Error('不支持该 BMP 图片文件头。');
  }

  validateInputDimensions(width, height);
  validateBmpFileLayout(header, fileSize, headerSize, width, height);
  return { width, height, decoder: 'bmp' };
}

async function getImageDescription(filePath, extension, fileSize) {
  if (extension === 'bmp') return getBmpDescription(filePath, fileSize);

  if (SHARP_INPUT_EXTENSIONS.has(extension)) {
    const metadata = await sharp(filePath, {
      page: 0,
      sequentialRead: true,
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    const dimensions = getOrientedDimensions(metadata);
    if (!dimensions.width || !dimensions.height) throw new Error('无法确定图片尺寸。');
    return { ...dimensions, decoder: 'sharp', isAnimated: (metadata.pages ?? 1) > 1 };
  }

  if (!nativeImageApi) throw new Error(`无法解码 .${extension} 图片格式。`);
  const image = nativeImageApi.createFromPath(filePath);
  if (image.isEmpty()) throw new Error('无法解码图片。');
  const dimensions = image.getSize();
  validateInputDimensions(dimensions.width, dimensions.height);
  return { ...dimensions, decoder: 'native', nativeImage: image };
}

function createAssetToken(filePath, stats, width, height, outputKind) {
  return crypto
    .createHash('sha256')
    .update(`${filePath}\0${stats.size}\0${stats.mtimeMs}\0${width}x${height}\0${outputKind}`)
    .digest('hex');
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeCacheFileAtomically(cachePath, writer) {
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.${++cacheTempCounter}.tmp`;
  try {
    await writer(tempPath);
    await fs.promises.rename(tempPath, cachePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error('Failed to remove temporary image cache file:', cleanupError);
    }
    throw error;
  }
}

function assertBmpDimensions(description, actualWidth, actualHeight) {
  if (actualWidth !== description.width || actualHeight !== description.height) {
    throw new Error('BMP 文件头尺寸与实际解码尺寸不一致。');
  }
}

async function createBmpSharpPipeline(filePath, description) {
  const bmpBuffer = await fs.promises.readFile(filePath);

  try {
    const decoded = decodeBmp(bmpBuffer);
    assertBmpDimensions(description, decoded.width, decoded.height);
    validateInputDimensions(decoded.width, decoded.height);
    if (
      ![1, 3, 4].includes(decoded.channels) ||
      decoded.data.byteLength !== decoded.width * decoded.height * decoded.channels
    ) {
      throw new Error('BMP 图片解码后的像素数据无效。');
    }
    return sharp(decoded.data, {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: decoded.channels,
      },
      limitInputPixels: MAX_INPUT_PIXELS,
    });
  } catch (error) {
    if (!(error instanceof BmpError) || error.code !== 'EMBEDDED_IMAGE') {
      if (error instanceof Error && /[\u3400-\u9fff]/u.test(error.message)) throw error;
      throw new Error('BMP 图片无法解码或文件已损坏。', { cause: error });
    }

    const embedded = extractCompressedData(bmpBuffer);
    const metadata = await sharp(embedded.data, {
      page: 0,
      sequentialRead: true,
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    const dimensions = getOrientedDimensions(metadata);
    assertBmpDimensions(description, dimensions.width, dimensions.height);
    return sharp(embedded.data, {
      page: 0,
      sequentialRead: true,
      limitInputPixels: MAX_INPUT_PIXELS,
    }).autoOrient();
  }
}

async function renderCachedPng(filePath, description, displaySize, cachePath) {
  if (description.decoder === 'sharp') {
    await writeCacheFileAtomically(cachePath, tempPath =>
      sharp(filePath, {
        page: 0,
        sequentialRead: true,
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .autoOrient()
        .resize(displaySize.width, displaySize.height, { fit: 'fill' })
        .png()
        .toFile(tempPath),
    );
    return;
  }

  if (description.decoder === 'bmp') {
    await writeCacheFileAtomically(cachePath, async tempPath => {
      const pipeline = await createBmpSharpPipeline(filePath, description);
      await pipeline.resize(displaySize.width, displaySize.height, { fit: 'fill' }).png().toFile(tempPath);
    });
    return;
  }

  const resizedImage = description.nativeImage.resize({
    width: displaySize.width,
    height: displaySize.height,
    quality: 'best',
  });
  await writeCacheFileAtomically(cachePath, tempPath => fs.promises.writeFile(tempPath, resizedImage.toPNG()));
}

async function pruneImageCache(protectedPath = '') {
  const entries = await fs.promises.readdir(imageCacheDirectory, { withFileTypes: true });
  const files = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue;
    const filePath = path.join(imageCacheDirectory, entry.name);
    const stats = await fs.promises.stat(filePath);
    files.push({ filePath, size: stats.size, mtimeMs: stats.mtimeMs });
    totalBytes += stats.size;
  }

  files.sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const file of files) {
    if (totalBytes <= MAX_CACHE_BYTES) break;
    if (file.filePath === protectedPath) continue;
    try {
      await fs.promises.unlink(file.filePath);
      totalBytes -= file.size;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Failed to prune image cache file:', error);
    }
  }
}

export async function initializeImageFileReader(electronApp, electronNativeImage = null) {
  nativeImageApi = electronNativeImage;
  imageAssets.clear();
  imageCacheDirectory = path.join(electronApp.getPath('userData'), 'image-cache');
  try {
    await fs.promises.rm(imageCacheDirectory, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to fully clear the image cache; continuing with the existing directory:', error);
  }
  await fs.promises.mkdir(imageCacheDirectory, { recursive: true });
}

export function registerImageProtocol(electronProtocol, electronNet) {
  electronProtocol.handle(IMAGE_PROTOCOL_SCHEME, async request => {
    const url = new URL(request.url);
    const token = url.hostname === 'cache' ? url.pathname.slice(1) : '';
    const asset = imageAssets.get(token);
    if (!asset || !(await fileExists(asset.path))) return new Response('Image asset not found.', { status: 404 });

    const fileResponse = await electronNet.fetch(pathToFileURL(asset.path).toString());
    const headers = new Headers(fileResponse.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Type', asset.mimeType);
    return new Response(fileResponse.body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers,
    });
  });
}

export async function prepareImageFile(filePath, limits = {}) {
  if (!imageCacheDirectory) throw new Error('图片读取服务尚未初始化。');

  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error('不支持该图片格式。');

  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile()) throw new Error('图片路径没有指向文件。');
  if (stats.size > MAX_INPUT_FILE_BYTES) {
    throw new Error('图片文件超过 64 MB 输入限制。');
  }

  const description = await getImageDescription(filePath, extension, stats.size);
  const displaySize = calculateDisplaySize(description.width, description.height, limits);
  const requiresResize = displaySize.width !== description.width || displaySize.height !== description.height;
  const requiresPngConversion =
    description.isAnimated || PNG_CONVERSION_EXTENSIONS.includes(extension) || requiresResize;
  const outputKind = requiresPngConversion ? 'png' : extension;
  const token = createAssetToken(filePath, stats, displaySize.width, displaySize.height, outputKind);

  let assetPath = filePath;
  let mimeType = DIRECT_IMAGE_MIME_TYPES[extension];
  if (requiresPngConversion) {
    assetPath = path.join(imageCacheDirectory, `${token}.png`);
    mimeType = 'image/png';
    if (!(await fileExists(assetPath))) {
      await renderCachedPng(filePath, description, displaySize, assetPath);
    } else {
      const now = new Date();
      await fs.promises.utimes(assetPath, now, now);
    }
    await pruneImageCache(assetPath);
  }

  imageAssets.set(token, { path: assetPath, mimeType });
  return {
    url: `${IMAGE_PROTOCOL_SCHEME}://cache/${token}`,
    path: filePath,
    fileName: path.basename(filePath),
    originalWidth: description.width,
    originalHeight: description.height,
    displayWidth: displaySize.width,
    displayHeight: displaySize.height,
    coordinateScaleX: calculateCoordinateScale(description.width, displaySize.width),
    coordinateScaleY: calculateCoordinateScale(description.height, displaySize.height),
    mimeType,
  };
}
