import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import sharp from 'sharp';

export const IMAGE_PROTOCOL_SCHEME = 'quad-image';
export const MAX_DISPLAY_PIXELS = 8_000_000;
export const MAX_DISPLAY_DIMENSION = 4096;
export const MAX_INPUT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_CACHE_BYTES = 512 * 1024 * 1024;

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

const PNG_CONVERSION_EXTENSIONS = Object.freeze(['gif', 'webp', 'svg', 'tiff', 'tif', 'svgz']);
const SHARP_INPUT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', ...PNG_CONVERSION_EXTENSIONS]);
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
    throw new Error('Invalid image dimensions.');
  }

  const dimensionScale = Math.min(maxDimension / width, maxDimension / height);
  const pixelScale = Math.sqrt(maxPixels / (width * height));
  const scale = Math.min(1, dimensionScale, pixelScale);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function calculateCoordinateScale(originalSize, displaySize) {
  if (originalSize === displaySize) return 1;
  if (originalSize <= 1 || displaySize <= 1) return 0;
  return (displaySize - 1) / (originalSize - 1);
}

function getOrientedDimensions(metadata) {
  const shouldSwapAxes = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: shouldSwapAxes ? metadata.height : metadata.width,
    height: shouldSwapAxes ? metadata.width : metadata.height,
  };
}

async function getImageDescription(filePath, extension) {
  if (SHARP_INPUT_EXTENSIONS.has(extension)) {
    const metadata = await sharp(filePath, {
      page: 0,
      sequentialRead: true,
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    const dimensions = getOrientedDimensions(metadata);
    if (!dimensions.width || !dimensions.height) throw new Error('Unable to determine image dimensions.');
    return { ...dimensions, sharpSupported: true, isAnimated: (metadata.pages ?? 1) > 1 };
  }

  if (!nativeImageApi) throw new Error(`Image format .${extension} cannot be decoded.`);
  const image = nativeImageApi.createFromPath(filePath);
  if (image.isEmpty()) throw new Error('Unable to decode the image.');
  return { ...image.getSize(), sharpSupported: false, nativeImage: image };
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

async function renderCachedPng(filePath, description, displaySize, cachePath) {
  if (description.sharpSupported) {
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
  if (!imageCacheDirectory) throw new Error('Image file reader is not initialized.');

  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error('Unsupported image format');

  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile()) throw new Error('Image path does not point to a file.');
  if (stats.size > MAX_INPUT_FILE_BYTES) {
    throw new Error('Image file exceeds the 64 MB input limit.');
  }

  const description = await getImageDescription(filePath, extension);
  const displaySize = calculateDisplaySize(description.width, description.height, limits);
  const requiresResize = displaySize.width !== description.width || displaySize.height !== description.height;
  const requiresPngConversion = description.isAnimated || PNG_CONVERSION_EXTENSIONS.includes(extension) || requiresResize;
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
