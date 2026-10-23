export const ANNOTATION_INPUT_SOURCE = Object.freeze({ TEXT: 'text', IMAGE: 'image' });

export function isAnnotationInputSource(value) {
  return Object.values(ANNOTATION_INPUT_SOURCE).includes(value);
}
