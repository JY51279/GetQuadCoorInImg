import { normalizeCoordinateScale } from '../utils/AnnotationCoordinates.js';

// A committed image and its coordinate metadata always travel together.
// The page owns this snapshot; the canvas only holds a presentation reference.
export function createImageSession({ image, imageInfo, request, datasetVersion }) {
  const coordinateScale = normalizeCoordinateScale({ x: imageInfo?.coordinateScaleX, y: imageInfo?.coordinateScaleY });
  const dimensions = [
    imageInfo?.originalWidth,
    imageInfo?.originalHeight,
    imageInfo?.displayWidth,
    imageInfo?.displayHeight,
  ];
  if (!coordinateScale || !dimensions.every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('图片会话的尺寸或坐标比例无效。');
  }
  if (!image?.src || image.naturalWidth !== imageInfo.displayWidth || image.naturalHeight !== imageInfo.displayHeight) {
    throw new Error('图片会话与解码后的图片不一致。');
  }
  if (
    typeof imageInfo.path !== 'string' ||
    !imageInfo.path.trim() ||
    !Number.isSafeInteger(datasetVersion) ||
    datasetVersion < 1 ||
    !Number.isSafeInteger(request?.requestId) ||
    request.requestId < 1 ||
    !Number.isSafeInteger(request?.operationId) ||
    request.operationId < 1
  ) {
    throw new Error('图片会话缺少有效的身份信息。');
  }
  return Object.freeze({
    image,
    path: imageInfo.path.replace(/[\\/]/g, '/'),
    fileName:
      typeof imageInfo.fileName === 'string' && imageInfo.fileName.trim()
        ? imageInfo.fileName
        : imageInfo.path.split(/[\\/]/).at(-1),
    originalSize: Object.freeze({ width: imageInfo.originalWidth, height: imageInfo.originalHeight }),
    displaySize: Object.freeze({ width: imageInfo.displayWidth, height: imageInfo.displayHeight }),
    coordinateScale: Object.freeze(coordinateScale),
    datasetVersion,
    requestId: request.requestId,
    operationId: request.operationId,
  });
}

export function belongsToDataset(session, datasetVersion) {
  return Boolean(session && session.datasetVersion === datasetVersion);
}
