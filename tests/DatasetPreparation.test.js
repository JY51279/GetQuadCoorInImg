import { describe, expect, it, vi } from 'vitest';

// Importing the pure preparation module must never load the active state or Vue.
vi.mock('../src/renderer/src/state/DatasetState.js', () => {
  throw new Error('Unexpected active state dependency');
});
vi.mock('vue', () => {
  throw new Error('Unexpected Vue dependency');
});

import { prepareJsonProcess } from '../src/renderer/src/utils/DatasetPreparation.js';
import { createPicture } from './fixtures/DatasetFixtures.js';

describe('Pure dataset preparation', () => {
  it('prepares independent results without a workspace or mutations to the input', () => {
    const input = Object.freeze({
      str: JSON.stringify({ Picture: [createPicture('DBR', 'C:/images/one.png')] }),
      path: 'C:/datasets/one.json',
    });
    const first = prepareJsonProcess(input);
    const second = prepareJsonProcess(input);
    expect(first.success).toBe(true);
    expect(second).toEqual(first);
    first.data.Picture[0]['Image Source'] = 'changed.png';
    expect(second.data.Picture[0]['Image Source']).toBe('C:/images/one.png');
    expect(JSON.parse(input.str).Picture[0]['Image Source']).toBe('C:/images/one.png');
  });

  it('rejects malformed input without requiring a session', () => {
    expect(prepareJsonProcess(null).success).toBe(false);
    expect(prepareJsonProcess({ str: '{', path: 'broken.json' }).success).toBe(false);
  });
});
