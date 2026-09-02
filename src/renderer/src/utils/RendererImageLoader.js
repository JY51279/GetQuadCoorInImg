const DEFAULT_MAX_IMAGE_DIMENSION = 3072;

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function loadRendererImage(src, maxDimension = DEFAULT_MAX_IMAGE_DIMENSION) {
  const originalImage = await loadImageElement(src);
  const { width, height } = originalImage;

  if (width <= maxDimension && height <= maxDimension) {
    return { image: originalImage, initialScale: 1 };
  }

  const initialScale = maxDimension / Math.max(width, height);
  const resizedWidth = Math.floor(width * initialScale);
  const resizedHeight = Math.floor(height * initialScale);
  const canvas = document.createElement('canvas');
  canvas.width = resizedWidth;
  canvas.height = resizedHeight;

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Failed to create the image resize canvas context.');
  context.drawImage(originalImage, 0, 0, resizedWidth, resizedHeight);

  const resizedImage = await loadImageElement(canvas.toDataURL('image/png'));
  return { image: resizedImage, initialScale };
}
