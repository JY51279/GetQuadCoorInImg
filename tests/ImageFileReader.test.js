import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { DIRECT_IMAGE_MIME_TYPES, IMAGE_EXTENSIONS, sendImageFile } from '../src/main/ImageFileReader.js';

const temporaryDirectories = [];

async function createTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-image-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function collectReplies() {
  const replies = [];
  return {
    replies,
    event: {
      reply(channel, payload) {
        replies.push({ channel, payload });
      },
    },
  };
}

function joinImageChunks(replies) {
  return replies.map(reply => reply.payload.picInfo.str).join('');
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

  it('streams a normal image in reconstructable Base64 chunks', async () => {
    const root = await createTemporaryDirectory();
    const imagePath = path.join(root, 'large.png');
    const imageBytes = Buffer.alloc(900000, 173);
    await fs.writeFile(imagePath, imageBytes);
    const response = collectReplies();

    await sendImageFile(response.event, imagePath, 17);

    expect(response.replies.length).toBeGreaterThanOrEqual(2);
    expect(response.replies.every(reply => reply.channel === 'open-pic-file-response')).toBe(true);
    expect(response.replies.every(reply => reply.payload.requestId === 17)).toBe(true);
    expect(joinImageChunks(response.replies)).toBe(`data:image/png;base64,${imageBytes.toString('base64')}`);
    expect(response.replies.at(-1).payload.picInfo).toMatchObject({
      path: imagePath,
      fileName: 'large.png',
    });
  });

  it('uses the standard JPEG MIME type', async () => {
    const root = await createTemporaryDirectory();
    const imagePath = path.join(root, 'sample.jpg');
    const imageBytes = Buffer.from([1, 2, 3, 4]);
    await fs.writeFile(imagePath, imageBytes);
    const response = collectReplies();

    await sendImageFile(response.event, imagePath, 19);

    expect(joinImageChunks(response.replies)).toBe(`data:image/jpeg;base64,${imageBytes.toString('base64')}`);
  });

  it('returns one failure response for an unsupported extension', async () => {
    const root = await createTemporaryDirectory();
    const imagePath = path.join(root, 'image.txt');
    const response = collectReplies();

    await sendImageFile(response.event, imagePath, 23);

    expect(response.replies).toEqual([
      {
        channel: 'open-pic-file-response',
        payload: {
          success: false,
          requestId: 23,
          error: 'Unsupported image format',
          path: imagePath,
        },
      },
    ]);
  });

  it('converts TIFF data to PNG before sending it', async () => {
    const root = await createTemporaryDirectory();
    const imagePath = path.join(root, 'sample.tiff');
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .tiff()
      .toFile(imagePath);
    const response = collectReplies();

    await sendImageFile(response.event, imagePath, 31);

    expect(response.replies.every(reply => reply.payload.success === true)).toBe(true);
    expect(response.replies.every(reply => reply.payload.requestId === 31)).toBe(true);
    const dataUrl = joinImageChunks(response.replies);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const pngBytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(response.replies.at(-1).payload.picInfo.path).toBe(imagePath);
  }, 15000);

  it('converts compressed SVG data to PNG before sending it', async () => {
    const root = await createTemporaryDirectory();
    const imagePath = path.join(root, 'sample.svgz');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>';
    await fs.writeFile(imagePath, zlib.gzipSync(svg));
    const response = collectReplies();

    await sendImageFile(response.event, imagePath, 37);

    expect(response.replies.every(reply => reply.payload.success === true)).toBe(true);
    const dataUrl = joinImageChunks(response.replies);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const pngBytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
