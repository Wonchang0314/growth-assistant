import { describe, expect, it } from 'vitest';
import { decodeComponentId, encodeComponentId } from './component-id.js';

describe('component-id', () => {
  it('인코딩한 값을 그대로 되돌린다', () => {
    const id = { module: 'quiz', action: 'answer', args: ['42', 'B'] };

    expect(encodeComponentId(id)).toBe('quiz:answer:42:B');
    expect(decodeComponentId(encodeComponentId(id))).toEqual(id);
  });

  it('인자가 없어도 된다', () => {
    expect(decodeComponentId('tutor:start')).toEqual({ module: 'tutor', action: 'start', args: [] });
  });

  it('규칙에 맞지 않는 ID는 undefined다', () => {
    expect(decodeComponentId('legacy-button')).toBeUndefined();
    expect(decodeComponentId(':start')).toBeUndefined();
    expect(decodeComponentId('tutor:')).toBeUndefined();
  });

  it('구분자가 들어간 값과 100자를 넘는 ID는 만들 수 없다', () => {
    expect(() => encodeComponentId({ module: 'quiz', action: 'answer', args: ['a:b'] })).toThrow();
    expect(() => encodeComponentId({ module: 'quiz', action: 'answer', args: ['x'.repeat(100)] })).toThrow();
  });
});
