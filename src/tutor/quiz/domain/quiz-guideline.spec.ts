import { describe, expect, it } from 'vitest';
import { editGuideline, formatGuideline, parseGuideline } from './quiz-guideline.js';

describe('출제 지침', () => {
  it('한 줄에 규칙 하나로 저장하고 읽는다. 빈 줄과 앞뒤 공백은 지운다', () => {
    expect(parseGuideline(formatGuideline(['보기를 짧게', '코드 금지']))).toEqual(['보기를 짧게', '코드 금지']);
    expect(parseGuideline('  보기를 짧게 \n\n')).toEqual(['보기를 짧게']);
    expect(parseGuideline(undefined)).toEqual([]);
  });

  it('규칙을 더하고 뺀다. 이미 있는 규칙은 다시 더하지 않고, 줄바꿈은 공백으로 바꾼다', () => {
    const result = editGuideline(['보기를 짧게', '코드 금지'], {
      add: ['보기를 짧게', '영어\n용어는 원문으로'],
      remove: ['코드 금지', '없는 규칙'],
    });

    expect(result).toEqual({ rules: ['보기를 짧게', '영어 용어는 원문으로'], notFound: ['없는 규칙'] });
  });
});
