import { describe, expect, it } from 'vitest';
import { type ConceptTerms, matchConcepts, normalizeTerm, resolveConcept } from './concept.js';

const concepts: ConceptTerms[] = [
  { id: 1, name: '인덱스 원리', aliases: ['인덱스', 'index'] },
  { id: 2, name: 'B-tree 인덱스', aliases: ['B-tree', 'B+tree'] },
  { id: 3, name: '복합 인덱스 설계', aliases: ['composite index'] },
  { id: 4, name: '트랜잭션 격리 수준', aliases: ['isolation level', 'MVCC'] },
  { id: 5, name: 'JavaScript 언어', aliases: ['JS'] },
  { id: 6, name: 'JSON 직렬화와 네이밍 전략', aliases: ['Jackson'] },
  { id: 7, name: '날짜·시간과 타임존', aliases: ['ZoneId'] },
];

const names = (topic: string, limit = 5) => matchConcepts(topic, concepts, limit).map((c) => c.name);

describe('normalizeTerm', () => {
  it('대소문자, 공백, 가운뎃점, 하이픈 차이를 무시한다', () => {
    expect(normalizeTerm('B-tree 인덱스')).toBe(normalizeTerm('btree인덱스'));
    expect(normalizeTerm('날짜·시간')).toBe(normalizeTerm('날짜 시간'));
  });
});

describe('matchConcepts', () => {
  it('별칭이 주제의 한 단어와 같으면 그 개념을 가장 먼저 고른다', () => {
    expect(names('PostgreSQL 인덱스 공부하자')[0]).toBe('인덱스 원리');
  });

  it('주제 단어가 이름에 들어 있는 개념도 고르되 짧은 이름(정규화 기준)부터', () => {
    // 별칭이 단어와 같은 "인덱스 원리"가 먼저, 나머지는 "복합인덱스설계"(7자)가 "btree인덱스"(8자)보다 앞선다.
    expect(names('인덱스')).toEqual(['인덱스 원리', '복합 인덱스 설계', 'B-tree 인덱스']);
  });

  it('띄어쓰기가 달라도 3글자 이상 이름은 주제 안에서 찾는다', () => {
    expect(names('트랜잭션격리수준이 헷갈려')).toEqual(['트랜잭션 격리 수준']);
  });

  it('짧은 별칭과 2글자 영문 단어는 다른 단어 안에서 걸리지 않는다', () => {
    expect(names('JSON 응답이 깨져')).not.toContain('JavaScript 언어');
    expect(names('JS 클로저')).toEqual(['JavaScript 언어']);
  });

  it('한글 단어 끝의 조사를 떼고도 비교한다', () => {
    expect(names('복합인덱스를 설계하자')).toContain('복합 인덱스 설계');
    expect(names('트랜잭션 격리 수준이 뭐야')[0]).toBe('트랜잭션 격리 수준');
  });

  it('맞는 개념이 없거나 주제가 비면 빈 배열', () => {
    expect(names('양자역학')).toEqual([]);
    expect(names('  ')).toEqual([]);
  });

  it('개수를 제한한다', () => {
    expect(names('인덱스', 2)).toHaveLength(2);
  });
});

describe('resolveConcept', () => {
  it('이름이나 별칭이 정규화 기준으로 같은 개념을 찾는다', () => {
    expect(resolveConcept('b tree 인덱스', concepts)?.id).toBe(2);
    expect(resolveConcept('mvcc', concepts)?.id).toBe(4);
  });

  it('부분만 같으면 찾지 않는다', () => {
    expect(resolveConcept('인덱스 설계', concepts)).toBeUndefined();
  });
});
