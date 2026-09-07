import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DIRECT_IMAGE_MIME_TYPES,
  IMAGE_EXTENSIONS,
  MAX_INPUT_FILE_BYTES,
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
    expect(calculateCoordinateScale(2, 1)).toBe(0);
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

    const result = await prepareImageFile(imagePath, { maxPixels: 2, maxDimension: 4 });
    const cacheFiles = await fs.readdir(cacheDirectory);
    const metadata = await sharp(path.join(cacheDirectory, cacheFiles[0])).metadata();

    expect(result).toMatchObject({
      originalWidth: 4,
      originalHeight: 2,
      displayWidth: 2,
      displayHeight: 1,
      coordinateScaleX: 1 / 3,
      coordinateScaleY: 0,
      mimeType: 'image/png',
    });
    expect(cacheFiles).toHaveLength(1);
    expect(cacheFiles[0]).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(metadata).toMatchObject({ width: 2, height: 1, format: 'png' });
  });

  it('rejects unsupported extensions before attempting to decode them', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'image.txt');
    await fs.writeFile(imagePath, 'not an image');

    await expect(prepareImageFile(imagePath)).rejects.toThrow('Unsupported image format');
  });

  it('rejects oversized encoded files before decoding them', async () => {
    const { directory } = await createImageEnvironment();
    const imagePath = path.join(directory, 'oversized.bmp');
    const file = await fs.open(imagePath, 'w');
    await file.truncate(MAX_INPUT_FILE_BYTES + 1);
    await file.close();

    await expect(prepareImageFile(imagePath)).rejects.toThrow('64 MB input limit');
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
