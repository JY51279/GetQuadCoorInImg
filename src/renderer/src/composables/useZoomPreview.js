import { watch } from 'vue';
import { configureZoomCanvas, drawZoomPreview } from '../utils/ZoomViewRenderer.js';

export function useZoomPreview({ getCanvas, pixelRatio, image, points }) {
  let sourceOrigin = null;
  let configuredPixelRatio = null;
  let disposed = false;

  function update(origin = null) {
    if (disposed) return false;
    if (origin !== null) {
      if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) return false;
      sourceOrigin = { x: origin.x, y: origin.y };
    }

    const currentImage = image.value;
    if (!currentImage?.complete || sourceOrigin === null) return false;
    try {
      drawZoomPreview(getCanvas(), currentImage, sourceOrigin, points);
      return true;
    } catch (error) {
      console.error('Failed to draw the zoom preview:', error);
      return false;
    }
  }

  function reset() {
    sourceOrigin = null;
    const canvas = getCanvas();
    const context = canvas?.getContext('2d');
    if (context !== null && context !== undefined) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function syncCanvasPixelRatio() {
    if (disposed) return false;
    const nextPixelRatio = pixelRatio.value;
    if (nextPixelRatio === configuredPixelRatio) return false;
    const canvas = getCanvas();
    if (canvas === null) return false;

    configuredPixelRatio = configureZoomCanvas(canvas, nextPixelRatio);
    update();
    return true;
  }

  const stopPixelRatioWatch = watch(pixelRatio, syncCanvasPixelRatio);
  const stopPointWatch = watch(points, () => update());

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopPixelRatioWatch();
    stopPointWatch();
    sourceOrigin = null;
  }

  return {
    update,
    reset,
    syncCanvasPixelRatio,
    dispose,
  };
}
