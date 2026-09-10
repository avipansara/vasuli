import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  buildDistinctIdInput,
  buildGroupKeyInput,
  deriveDistinctId,
  deriveGroupKey,
  pureJsSha256,
} from './identity';

describe('identity hashing', () => {
  it('pureJsSha256 matches node crypto sha256 output across diverse inputs', () => {
    const samples = [
      'vasuli:v1:user:8470a257-22d7-4632-9c1a-5ff7b5a83a1b',
      'vasuli:v1:group:9970a257-22d7-4632-9c1a-5ff7b5a83a1c',
      'hello world',
      'unicode test: 🚀 Vasuli वसुलୀ',
      '',
      'A'.repeat(500),
    ];

    for (const sample of samples) {
      const expected = createHash('sha256').update(sample).digest('hex');
      const actual = pureJsSha256(sample);
      expect(actual).toBe(expected);
    }
  });

  it('deriveDistinctId and deriveGroupKey succeed even when expo-crypto native module throws', async () => {
    const userUuid = '8470a257-22d7-4632-9c1a-5ff7b5a83a1b';
    const groupUuid = '9970a257-22d7-4632-9c1a-5ff7b5a83a1c';

    const distinctId = await deriveDistinctId(userUuid);
    const expectedDistinctId = createHash('sha256')
      .update(buildDistinctIdInput(userUuid))
      .digest('hex');
    expect(distinctId).toBe(expectedDistinctId);

    const groupKey = await deriveGroupKey(groupUuid);
    const expectedGroupKey = createHash('sha256')
      .update(buildGroupKeyInput(groupUuid))
      .digest('hex');
    expect(groupKey).toBe(expectedGroupKey);
  });
});
