import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_SESSION_SCHEMA_VERSION,
  createWorkspaceSession,
  normalizeWorkspaceSession,
} from '../src/shared/WorkspaceSession.js';

describe('Workspace session schema', () => {
  it('creates a stable version-one session without incrementing the schema version', () => {
    expect(createWorkspaceSession('C:/datasets/A.json')).toEqual({
      schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
      datasetPath: 'C:/datasets/A.json',
      imagePath: '',
      imageIndex: null,
    });
    expect(createWorkspaceSession('C:/datasets/B.json')).toMatchObject({ schemaVersion: 1 });
  });

  it('keeps an image index only when an image path is present', () => {
    expect(createWorkspaceSession('C:/datasets/A.json', { imageIndex: 3 })).toMatchObject({
      imagePath: '',
      imageIndex: null,
    });
    expect(
      createWorkspaceSession('C:/datasets/A.json', {
        imagePath: 'C:/images/one.png',
        imageIndex: 3,
      }),
    ).toMatchObject({ imagePath: 'C:/images/one.png', imageIndex: 3 });
  });

  it('rejects missing dataset paths and unsupported schemas', () => {
    expect(createWorkspaceSession('')).toBeNull();
    expect(normalizeWorkspaceSession({ schemaVersion: 2, datasetPath: 'C:/datasets/A.json' })).toBeNull();
  });
});
