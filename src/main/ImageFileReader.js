const fs = require('fs');
const path = require('path');
const UTIF = require('utif');
const { PNG } = require('pngjs');
const sharp = require('sharp');

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'tif',
  'webp',
  'svg',
  'svgz',
  'ico',
  'hdr',
  'exr',
  'pbm',
  'pgm',
  'ppm',
  'pcx',
  'tga',
  'wbmp',
  'xbm',
  'xpm',
];

const IMAGE_RESPONSE_CHANNEL = 'open-pic-file-response';
const BASE64_CHUNK_SIZE = 1024 * 1024;

function replyImageChunk(event, str, filePath = '', isComplete = false) {
  event.reply(IMAGE_RESPONSE_CHANNEL, {
    success: true,
    picInfo: {
      str,
      ...(isComplete ? { path: filePath, fileName: path.basename(filePath) } : { fileName: '' }),
    },
  });
}

function replyImageFailure(event, error, filePath) {
  event.reply(IMAGE_RESPONSE_CHANNEL, {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    path: filePath,
  });
}

function sendBufferAsBase64(event, buffer, filePath, mimeType) {
  replyImageChunk(event, `data:${mimeType};base64,`);
  const base64 = buffer.toString('base64');

  for (let startIndex = 0; startIndex < base64.length; startIndex += BASE64_CHUNK_SIZE) {
    replyImageChunk(event, base64.slice(startIndex, startIndex + BASE64_CHUNK_SIZE));
  }

  replyImageChunk(event, '', filePath, true);
}

function streamImageAsBase64(event, filePath, mimeType) {
  return new Promise((resolve, reject) => {
    let base64Chunk = `data:${mimeType};base64,`;
    const stream = fs.createReadStream(filePath, { encoding: 'base64' });

    stream.on('data', chunk => {
      base64Chunk += chunk;
      if (base64Chunk.length > BASE64_CHUNK_SIZE) {
        replyImageChunk(event, base64Chunk);
        base64Chunk = '';
      }
    });

    stream.on('end', () => {
      replyImageChunk(event, base64Chunk, filePath, true);
      resolve();
    });
    stream.on('error', reject);
  });
}

function encodeRgbaAsPng(rgbaData, width, height) {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width, height });
    png.data = Buffer.from(rgbaData);
    const chunks = [];

    png
      .pack()
      .on('data', chunk => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

async function convertTiffToPng(data) {
  try {
    const tiffPages = UTIF.decode(data);
    const firstPage = tiffPages[0];
    const compressionType = firstPage?.t259?.[0] ?? 'Unknown';
    if ([3, 4, 6].includes(compressionType)) {
      throw new Error('UTIF does not support this compression.');
    }

    UTIF.decodeImage(data, firstPage);
    if (!firstPage?.data) throw new Error('TIFF decoding failed: no image data found.');

    const firstPageRgba = UTIF.toRGBA8(firstPage);
    if (firstPageRgba.length === 0) throw new Error('UTIF failed: RGBA data is empty.');

    return await encodeRgbaAsPng(firstPageRgba, firstPage.width, firstPage.height);
  } catch (utifError) {
    console.warn(`UTIF decoding failed; using Sharp instead: ${utifError.message}`);
    return sharp(data).png().toBuffer();
  }
}

export async function sendImageFile(event, filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) {
    replyImageFailure(event, 'Unsupported image format', filePath);
    return;
  }

  try {
    if (extension === 'tiff' || extension === 'tif') {
      const data = await fs.promises.readFile(filePath);
      const pngBuffer = await convertTiffToPng(data);
      sendBufferAsBase64(event, pngBuffer, filePath, 'image/png');
      return;
    }

    await streamImageAsBase64(event, filePath, `image/${extension}`);
  } catch (error) {
    replyImageFailure(event, error, filePath);
  }
}
