import { describe, expect, it } from 'vitest';
import { belongsToDataset, createImageSession } from '../src/renderer/src/state/ImageSession.js';

function input() {
  return {
    image: { src: 'prepared', naturalWidth: 40, naturalHeight: 30 },
    imageInfo: {
      path: 'C:\\images\\one.png',
      fileName: 'one.png',
      originalWidth: 100,
      originalHeight: 80,
      displayWidth: 40,
      displayHeight: 30,
      coordinateScaleX: 0.4,
      coordinateScaleY: 0.375,
    },
    request: { requestId: 3, operationId: 2 },
    datasetVersion: 7,
  };
}

describe('Image session snapshot', () => {
  it('owns one immutable identity and coordinate snapshot without proxying the image', () => {
    const source = input();
    const session = createImageSession(source);
    source.imageInfo.originalWidth = 999;
    source.request.requestId = 99;
    expect(session.image).toBe(source.image);
    expect(session).toMatchObject({
      path: 'C:/images/one.png',
      requestId: 3,
      operationId: 2,
      datasetVersion: 7,
      originalSize: { width: 100, height: 80 },
      displaySize: { width: 40, height: 30 },
      coordinateScale: { x: 0.4, y: 0.375 },
    });
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.originalSize)).toBe(true);
    expect(Object.isFrozen(session.coordinateScale)).toBe(true);
    expect(belongsToDataset(session, 7)).toBe(true);
    expect(belongsToDataset(session, 8)).toBe(false);
    expect(belongsToDataset(null, 7)).toBe(false);
    const invalidFileName = input();
    invalidFileName.imageInfo.fileName = { mutable: true };
    expect(createImageSession(invalidFileName).fileName).toBe('one.png');
  });

  it.each([
    { originalWidth: 0 },
    { originalHeight: NaN },
    { displayWidth: 30 },
    { displayHeight: 1.5 },
    { coordinateScaleX: 0 },
    { coordinateScaleY: Infinity },
    { path: '' },
  ])('rejects incomplete or inconsistent metadata: %j', invalid => {
    const source = input();
    Object.assign(source.imageInfo, invalid);
    expect(() => createImageSession(source)).toThrow();
  });

  it('rejects an unbound session or undecoded image', () => {
    expect(() => createImageSession({ ...input(), datasetVersion: 0 })).toThrow();
    expect(() => createImageSession({ ...input(), request: null })).toThrow();
    expect(() => createImageSession({ ...input(), image: null })).toThrow();
  });
});
