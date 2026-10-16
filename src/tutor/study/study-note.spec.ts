import { describe, expect, it } from 'vitest';
import { mergeConceptLinks, searchTermsOf } from './study-note.js';

describe('mergeConceptLinks', () => {
  it('같은 개념은 하나로 합치고, 한 번이라도 CONFUSED면 CONFUSED다', () => {
    expect(
      mergeConceptLinks([
        { conceptId: 1, signal: 'CONFUSED' },
        { conceptId: 2, signal: 'DISCUSSED' },
        { conceptId: 1, signal: 'DISCUSSED' },
        { conceptId: 2, signal: 'CONFUSED' },
      ]),
    ).toEqual([
      { conceptId: 1, signal: 'CONFUSED' },
      { conceptId: 2, signal: 'CONFUSED' },
    ]);
  });
});

describe('searchTermsOf', () => {
  it('주제 문장을 단어로 나누고 소문자로 바꾼다', () => {
    expect(searchTermsOf('PostgreSQL 인덱스, 선택도')).toEqual(['postgresql', '인덱스', '선택도']);
  });

  it('한 글자 단어와 중복을 뺀다', () => {
    expect(searchTermsOf('DB 의 B 트리 db')).toEqual(['db', '트리']);
  });

  it('검색어는 최대 5개다', () => {
    expect(searchTermsOf('aa bb cc dd ee ff')).toHaveLength(5);
  });

  it('검색어가 없으면 빈 배열이다', () => {
    expect(searchTermsOf(' ? ! ')).toEqual([]);
  });
});
