/* global globalThis */
import { afterEach, describe, expect, it } from 'vitest';
import { loadRendererImage } from '../src/renderer/src/utils/RendererImageLoader.js';

describe('Renderer image loader', () => {
  const originalImage = globalThis.Image;

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  function installImageMocks() {
    const imageSizes = new Map([
      ['small-image', { width: 640, height: 480 }],
      ['prepared-image', { width: 3072, height: 1536 }],
    ]);
    const createdImages = [];

    globalThis.Image = class MockImage {
      constructor() {
        this.complete = false;
        createdImages.push(this);
      }

      get src() {
        return this.imageSource;
      }

      set src(value) {
        this.imageSource = value;
        queueMicrotask(() => {
          const size = imageSizes.get(value);
          if (!size) {
            this.onerror?.(new Error('Unknown mock image.'));
            return;
          }
          this.width = size.width;
          this.height = size.height;
          this.naturalWidth = size.width;
          this.naturalHeight = size.height;
          this.complete = true;
          this.onload?.();
        });
      }
    };

    return { createdImages };
  }

  it('loads a prepared image without allocating a resize canvas', async () => {
    const { createdImages } = installImageMocks();
    const result = await loadRendererImage('prepared-image');

    expect(result).toBe(createdImages[0]);
    expect(result.crossOrigin).toBe('anonymous');
    expect(result.naturalWidth).toBe(3072);
    expect(createdImages).toHaveLength(1);
  });

  it('rejects when the prepared image URL cannot be decoded', async () => {
    installImageMocks();

    await expect(loadRendererImage('missing-image')).rejects.toThrow('Unknown mock image.');
  });
});
