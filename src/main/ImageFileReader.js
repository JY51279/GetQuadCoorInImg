import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

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

const PNG_CONVERSION_EXTENSIONS = Object.freeze(['tiff', 'tif', 'svgz']);

export const IMAGE_EXTENSIONS = Object.freeze([...Object.keys(DIRECT_IMAGE_MIME_TYPES), ...PNG_CONVERSION_EXTENSIONS]);

const IMAGE_RESPONSE_CHANNEL = 'open-pic-file-response';
const BASE64_CHUNK_SIZE = 1024 * 1024;

function replyImageChunk(event, str, filePath = '', isComplete = false, requestId = null) {
  event.reply(IMAGE_RESPONSE_CHANNEL, {
    success: true,
    requestId,
    picInfo: {
      str,
      ...(isComplete ? { path: filePath, fileName: path.basename(filePath) } : { fileName: '' }),
    },
  });
}

function replyImageFailure(event, error, filePath, requestId = null) {
  event.reply(IMAGE_RESPONSE_CHANNEL, {
    success: false,
    requestId,
    error: error instanceof Error ? error.message : String(error),
    path: filePath,
  });
}

function sendBufferAsBase64(event, buffer, filePath, mimeType, requestId) {
  replyImageChunk(event, `data:${mimeType};base64,`, '', false, requestId);
  const base64 = buffer.toString('base64');

  for (let startIndex = 0; startIndex < base64.length; startIndex += BASE64_CHUNK_SIZE) {
    replyImageChunk(event, base64.slice(startIndex, startIndex + BASE64_CHUNK_SIZE), '', false, requestId);
  }

  replyImageChunk(event, '', filePath, true, requestId);
}

function streamImageAsBase64(event, filePath, mimeType, requestId) {
  return new Promise((resolve, reject) => {
    let base64Chunk = `data:${mimeType};base64,`;
    const stream = fs.createReadStream(filePath, { encoding: 'base64' });

    stream.on('data', chunk => {
      base64Chunk += chunk;
      if (base64Chunk.length > BASE64_CHUNK_SIZE) {
        replyImageChunk(event, base64Chunk, '', false, requestId);
        base64Chunk = '';
      }
    });

    stream.on('end', () => {
      replyImageChunk(event, base64Chunk, filePath, true, requestId);
      resolve();
    });
    stream.on('error', reject);
  });
}

async function convertImageToPng(filePath) {
  return sharp(filePath, { page: 0 }).png().toBuffer();
}

export async function sendImageFile(event, filePath, requestId = null) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) {
    replyImageFailure(event, 'Unsupported image format', filePath, requestId);
    return;
  }

  try {
    if (PNG_CONVERSION_EXTENSIONS.includes(extension)) {
      const pngBuffer = await convertImageToPng(filePath);
      sendBufferAsBase64(event, pngBuffer, filePath, 'image/png', requestId);
      return;
    }

    await streamImageAsBase64(event, filePath, DIRECT_IMAGE_MIME_TYPES[extension], requestId);
  } catch (error) {
    replyImageFailure(event, error, filePath, requestId);
  }
}
