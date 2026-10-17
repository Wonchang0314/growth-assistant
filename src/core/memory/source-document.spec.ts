import { describe, expect, it } from 'vitest';
import { contentHashOf, diffChunks } from './source-document.js';

describe('diffChunks', () => {
  it.each([
    { name: '같으면 0', before: ['a', 'b'], after: ['a', 'b'], expected: { added: 0, removed: 0 } },
    { name: '순서만 바뀌면 0', before: ['a', 'b'], after: ['b', 'a'], expected: { added: 0, removed: 0 } },
    { name: '하나 고침', before: ['a', 'b'], after: ['a', 'c'], expected: { added: 1, removed: 1 } },
    { name: '처음 만듦', before: [], after: ['a', 'b'], expected: { added: 2, removed: 0 } },
    { name: '같은 청크가 둘이면 개수로 센다', before: ['a', 'a'], after: ['a'], expected: { added: 0, removed: 1 } },
  ])('$name', ({ before, after, expected }) => {
    expect(diffChunks(before, after)).toEqual(expected);
  });
});

describe('contentHashOf', () => {
  it('청크 순서가 바뀌면 문서 해시도 바뀐다', () => {
    expect(contentHashOf(['a', 'b'])).not.toBe(contentHashOf(['b', 'a']));
  });
});
