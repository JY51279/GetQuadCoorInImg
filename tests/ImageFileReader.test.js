import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { encode as encodeBmp } from '@nktkas/bmp';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DIRECT_IMAGE_MIME_TYPES,
  IMAGE_EXTENSIONS,
  MAX_INPUT_FILE_BYTES,
  MAX_INPUT_PIXELS,
  calculateCoordinateScale,
  calculateDisplaySize,
  initializeImageFileReader,
  prepareImageFile,
  registerImageProtocol,
} from '../src/main/ImageFileReader.js';

const temporaryDirectories = [];

async function createImageEnvironment() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-image-test-'));
  temporaryDirectories.push(directory);
  await initializeImageFileReader({ getPath: () => directory });
  return { directory, cacheDirectory: path.join(directory, 'image-cache') };
}

async function createSolidImage(filePath, width, height, format = 'png') {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .toFormat(format)
    .toFile(filePath);
}

function createBmpHeader(width, height, { bitsPerPixel = 24, compression = 0, imageSize = 0, dataOffset = 54 } = {}) {
  const header = Buffer.alloc(dataOffset);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(dataOffset + imageSize, 2);
  header.writeUInt32LE(dataOffset, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(bitsPerPixel, 28);
  header.writeUInt32LE(compression, 30);
  header.writeUInt32LE(imageSize, 34);
  return header;
}

function createBmp24(width, height, pixels, { topDown = false } = {}) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const imageSize = rowStride * height;
  const header = createBmpHeader(width, topDown ? -height : height, { imageSize });
  const pixelData = Buffer.alloc(imageSize);

  for (let storedY = 0; storedY < height; storedY += 1) {
    const sourceY = topDown ? storedY : height - 1 - storedY;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixels[sourceY * width + x];
      const offset = storedY * rowStride + x * 3;
      pixelData[offset] = blue;
      pixelData[offset + 1] = green;
      pixelData[offset + 2] = red;
    }
  }

  return Buffer.concat([header, pixelData]);
}

function createEmbeddedPngBmp(png, width, height) {
  return Buffer.concat([
    createBmpHeader(width, height, {
      bitsPerPixel: 0,
      compression: 5,
      imageSize: png.length,
    }),
    png,
  ]);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Main-process image file reader', () => {
  it('advertises only directly supported or PNG-convertible formats', () => {
    expect(IMAGE_EXTENSIONS).toEqual(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'svgz']);
    expect(DIRECT_IMAGE_MIME_TYPES.jpg).toBe('image/jpeg');
    expect(DIRECT_IMAGE_MIME_TYPES.svg).toBe('image/svg+xml');
  });

  it('calculates a display size constrained by both dimensions and pixel count', () => {
    expect(calculateDisplaySize(10000, 5000)).toEqual({ width: 4000, height: 2000 });
    expect(calculateDisplaySize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('uses endpoint-aware coordinate scales without changing image dimensions', () => {
    const coordinateScale = calculateCoordinateScale(10000, 4000);
    expect(coordinateScale).toBeCloseTo(3999 / 9999);
    expect(Math.round(9999 * coordinateScale)).toBe(3999);
    expect(Math.round(3999 / coordinateScale)).toBe(9999);
    expect(calculateCoordinateScale(1, 1)).toBe(1);
    expect(() => calculateCoordinateScale(2, 1)).toThrow('仅剩一个端点时无法保留可编辑坐标。');
  });

  it('keeps every non-degenerate source axis at least two pixels wide', () => {
    expect(calculateDisplaySize(10000, 2)).toEqual({ width: 4096, height: 2 });
    expect(calculateDisplaySize(1, 10000)).toEqual({ width: 1, height: 4096 });
    expect(calculateDisplaySize(100, 2, { maxPixels: 100, maxDimension: 100 })).toEqual({ width: 50, height: 2 });
    expect(() => calculateDisplaySize(4, 2, { maxPixels: 2, maxDimension: 4 })).toThrow(
      '图片显示尺寸限制过小，无法保留可编辑坐标。',
    );
  });

  it('registers a small browser-readable image without copying its bytes through IPC', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'sample.png');
    await createSolidImage(imagePath, 8, 4);

    const result = await prepareImageFile(imagePath);

    expect(result).toMatchObject({
      url: expect.stringMatching(/^quad-image:\/\/cache\/[a-f0-9]{64}$/),
      path: imagePath,
      fileName: 'sample.png',
      originalWidth: 8,
      originalHeight: 4,
      displayWidth: 8,
      displayHeight: 4,
      coordinateScaleX: 1,
      coordinateScaleY: 1,
      mimeType: 'image/png',
    });
    expect(await fs.readdir(cacheDirectory)).toEqual([]);
  });

  it('creates one bounded PNG cache image when the source exceeds display limits', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'large.jpg');
    await createSolidImage(imagePath, 4, 2, 'jpeg');

    const result = await prepareImageFile(imagePath, { maxPixels: 4, maxDimension: 4 });
    const cacheFiles = await fs.readdir(cacheDirectory);
    const metadata = await sharp(path.join(cacheDirectory, cacheFiles[0])).metadata();

    expect(result).toMatchObject({
      originalWidth: 4,
      originalHeight: 2,
      displayWidth: 2,
      displayHeight: 2,
      coordinateScaleX: 1 / 3,
      coordinateScaleY: 1,
      mimeType: 'image/png',
    });
    expect(cacheFiles).toHaveLength(1);
    expect(cacheFiles[0]).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(metadata).toMatchObject({ width: 2, height: 2, format: 'png' });
  });

  it('decodes a row-padded 24-bit BMP and caches an equivalent PNG', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'sample.bmp');
    const pixels = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [0, 0, 0],
      [255, 255, 0],
    ];
    await fs.writeFile(imagePath, createBmp24(3, 2, pixels));

    const result = await prepareImageFile(imagePath);
    const cacheFiles = await fs.readdir(cacheDirectory);
    const decoded = await sharp(path.join(cacheDirectory, cacheFiles[0])).raw().toBuffer({ resolveWithObject: true });

    expect(result).toMatchObject({
      originalWidth: 3,
      originalHeight: 2,
      displayWidth: 3,
      displayHeight: 2,
      coordinateScaleX: 1,
      coordinateScaleY: 1,
      mimeType: 'image/png',
    });
    expect(cacheFiles).toHaveLength(1);
    expect(decoded.info).toMatchObject({ width: 3, height: 2, channels: 3 });
    expect([...decoded.data]).toEqual(pixels.flat());
  });

  it('decodes top-down indexed BMP data through the grayscale raw-pixel path', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'indexed.bmp');
    const pixels = Uint8Array.from([0, 64, 128, 255]);
    const bmp = encodeBmp({ width: 2, height: 2, channels: 1, data: pixels }, { bitsPerPixel: 8, isTopDown: true });
    await fs.writeFile(imagePath, bmp);

    const result = await prepareImageFile(imagePath);
    const [cacheFile] = await fs.readdir(cacheDirectory);
    const decoded = await sharp(path.join(cacheDirectory, cacheFile)).raw().toBuffer({ resolveWithObject: true });

    expect(result.mimeType).toBe('image/png');
    expect(decoded.info).toMatchObject({ width: 2, height: 2, channels: 3 });
    expect([...decoded.data]).toEqual([...pixels].flatMap(value => [value, value, value]));
  });

  it('decodes PNG-compressed BMP pixel payloads', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'embedded-png.bmp');
    const png = await sharp({
      create: { width: 2, height: 1, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .png()
      .toBuffer();
    await fs.writeFile(imagePath, createEmbeddedPngBmp(png, 2, 1));

    const result = await prepareImageFile(imagePath);
    const [cacheFile] = await fs.readdir(cacheDirectory);
    const metadata = await sharp(path.join(cacheDirectory, cacheFile)).metadata();

    expect(result).toMatchObject({ originalWidth: 2, originalHeight: 1, mimeType: 'image/png' });
    expect(metadata).toMatchObject({ width: 2, height: 1, format: 'png' });
  });

  it('rejects BMP dimensions over the input pixel limit before decoding pixel data', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'pixel-bomb.bmp');
    const width = 10_000;
    const height = Math.floor(MAX_INPUT_PIXELS / width) + 1;
    await fs.writeFile(imagePath, createBmpHeader(width, height));

    await expect(prepareImageFile(imagePath)).rejects.toThrow('图片像素数量超过 4000 万限制。');
  });

  it('reports truncated BMP data as a decoding failure', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'truncated.bmp');
    await fs.writeFile(imagePath, createBmpHeader(2, 2));

    await expect(prepareImageFile(imagePath)).rejects.toThrow('BMP 图片像素数据不完整。');
  });

  it('rejects unsupported extensions before attempting to decode them', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'image.txt');
    await fs.writeFile(imagePath, 'not an image');

    await expect(prepareImageFile(imagePath)).rejects.toThrow('不支持该图片格式。');
  });

  it('rejects oversized encoded files before decoding them', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'oversized.bmp');
    const file = await fs.open(imagePath, 'w');
    await file.truncate(MAX_INPUT_FILE_BYTES + 1);
    await file.close();

    await expect(prepareImageFile(imagePath)).rejects.toThrow('图片文件超过 64 MB 输入限制。');
  });

  it('converts TIFF data to a cached PNG', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'sample.tiff');
    await createSolidImage(imagePath, 2, 2, 'tiff');

    const result = await prepareImageFile(imagePath);
    const cacheFiles = await fs.readdir(cacheDirectory);

    expect(result.mimeType).toBe('image/png');
    expect(cacheFiles).toHaveLength(1);
    expect((await sharp(path.join(cacheDirectory, cacheFiles[0])).metadata()).format).toBe('png');
  });

  it('applies TIFF orientation while preserving the oriented dimensions', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'oriented.tiff');
    await sharp({
      create: { width: 2, height: 3, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ orientation: 6 })
      .tiff()
      .toFile(imagePath);

    const result = await prepareImageFile(imagePath);
    const [cacheFile] = await fs.readdir(cacheDirectory);
    const metadata = await sharp(path.join(cacheDirectory, cacheFile)).metadata();

    expect(result).toMatchObject({
      originalWidth: 3,
      originalHeight: 2,
      displayWidth: 3,
      displayHeight: 2,
      mimeType: 'image/png',
    });
    expect(metadata).toMatchObject({ width: 3, height: 2, format: 'png' });
  });

  it('converts compressed SVG data to a cached PNG', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'sample.svgz');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>';
    await fs.writeFile(imagePath, zlib.gzipSync(svg));

    const result = await prepareImageFile(imagePath);
    const cacheFiles = await fs.readdir(cacheDirectory);

    expect(result.mimeType).toBe('image/png');
    expect(cacheFiles).toHaveLength(1);
    expect((await sharp(path.join(cacheDirectory, cacheFiles[0])).metadata()).format).toBe('png');
  });

  it('rasterizes ordinary SVG data instead of sending vector content to the renderer', async () => {
    const { directory, cacheDirectory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'sample.svg');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="blue"/></svg>';
    await fs.writeFile(imagePath, svg);

    const result = await prepareImageFile(imagePath);
    const cacheFiles = await fs.readdir(cacheDirectory);

    expect(result.mimeType).toBe('image/png');
    expect(cacheFiles).toHaveLength(1);
  });

  it('serves only registered image assets through the custom protocol', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'sample.png');
    await createSolidImage(imagePath, 2, 2);
    const imageInfo = await prepareImageFile(imagePath);
    let protocolHandler;
    const protocol = {
      handle(_scheme, handler) {
        protocolHandler = handler;
      },
    };
    const electronNet = {
      fetch: async () => new Response(await fs.readFile(imagePath)),
    };
    registerImageProtocol(protocol, electronNet);

    const response = await protocolHandler({ url: imageInfo.url });
    const missingResponse = await protocolHandler({ url: 'quad-image://cache/not-registered' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(missingResponse.status).toBe(404);
  });
});
