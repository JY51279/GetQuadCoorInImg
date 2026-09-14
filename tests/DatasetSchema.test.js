import { describe, expect, it } from 'vitest';
import { analyzeDataset, detectProductType, normalizeDataset } from '../src/renderer/src/utils/DatasetSchema.js';
import { createPicture } from './fixtures/DatasetFixtures.js';

describe('Dataset schema', () => {
  it.each(['DBR', 'DDN', 'DLR'])('detects the %s product schema', productType => {
    const result = detectProductType([createPicture(productType, 'image.png')]);
    expect(result).toEqual({ success: true, productType });
  });

  it('reports lossy DBR repairs before applying them and does not change the input object', () => {
    const source = {
      Picture: [
        null,
        {
          'Image Source': 'image.png',
          'No.': '7',
          'Barcode Count': '9',
          'Barcode Info': [{ 'Barcode Location': 'invalid' }],
        },
      ],
    };

    const analysis = analyzeDataset(source);
    expect(analysis.success).toBe(true);
    expect(analysis.requiresLossyRepair).toBe(true);
    expect(analysis.lossyIssues).toEqual([
      expect.objectContaining({ type: 'remove-picture', path: 'Picture[0]' }),
      expect.objectContaining({
        type: 'reset-location',
        path: 'Picture[1].Barcode Info[0].Barcode Location',
      }),
    ]);

    const pendingResult = normalizeDataset(source);
    expect(pendingResult.success).toBe(true);
    expect(pendingResult.requiresLossyRepair).toBe(true);
    expect(pendingResult.data).toBeUndefined();
    expect(source.Picture).toHaveLength(2);
    expect(source.Picture[1]['Barcode Info'][0]).toEqual({ 'Barcode Location': 'invalid' });

    const result = normalizeDataset(source, { allowLossyRepairs: true });
    expect(result.success).toBe(true);
    expect(result.productType).toBe('DBR');
    expect(result.changed).toBe(true);
    expect(result.data.Picture).toHaveLength(1);
    expect(result.data.Picture[0]['No.']).toBe('1');
    expect(result.data.Picture[0]['Barcode Count']).toBe(1);
    expect(result.data.Picture[0]['Barcode Info'][0]).toEqual({
      'Barcode Location': '0 0 0 0 0 0 0 0',
      'Barcode Hex': '',
      'Barcode Text': '',
      'Barcode Type': '',
    });
    expect(source.Picture).toHaveLength(2);
    expect(source.Picture[1]['Barcode Info'][0]).toEqual({ 'Barcode Location': 'invalid' });
  });

  it('applies non-lossy normalization without asking for lossy repair approval', () => {
    const source = {
      Picture: [
        {
          'Image Source': 'image.png',
          'No.': '9',
          'Barcode Count': '7',
          'Barcode Info': [{ 'Barcode Location': '0 0 10 0 10 10 0 10' }],
        },
      ],
    };

    const result = normalizeDataset(source);
    expect(result.success).toBe(true);
    expect(result.requiresLossyRepair).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.data.Picture[0]).toMatchObject({
      'No.': '1',
      'Barcode Count': 1,
    });
    expect(result.data.Picture[0]['Barcode Info'][0]).toMatchObject({
      'Barcode Hex': '',
      'Barcode Text': '',
      'Barcode Type': '',
    });
  });
});
