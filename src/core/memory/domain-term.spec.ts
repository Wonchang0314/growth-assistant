import { describe, expect, it } from 'vitest';
import { parseTermFile, termCandidates, toTermFile } from './domain-term.js';

describe('termCandidates', () => {
  const chunks = [
    'TB_STORE_DAILY에서 집계하고 ACME 원장과 맞춘다. SQL로 확인.',
    'ACME 쪽 서버 10.0.1.23, api.acme.co.kr 호출',
    'TB_STORE_DAILY 재생성',
  ];

  it('테이블명·IP·도메인·대문자 이름을 모아 많이 나온 순서로', () => {
    const result = termCandidates(chunks, ['SQL']);
    expect(result.map((c) => [c.term, c.kind, c.count])).toEqual([
      ['ACME', '대문자', 2],
      ['TB_STORE_DAILY', 'UPPER_SNAKE', 2],
      ['10.0.1.23', 'IP', 1],
      ['api.acme.co.kr', '도메인', 1],
    ]);
    expect(result[0]?.example).toContain('ACME 원장과');
  });

  it('개념 이름·별칭과 이미 등록한 용어는 대소문자를 가리지 않고 뺀다', () => {
    expect(termCandidates(['ACME와 Sql, TB_X_Y'], ['acme', 'sql']).map((c) => c.term)).toEqual(['TB_X_Y']);
  });
});

describe('용어 파일', () => {
  it('등록된 용어, 제안, 나머지 후보 순으로 쓰고, 일반 표현이 채워진 줄만 다시 읽는다', () => {
    const text = toTermFile({
      existing: [{ term: '\\.corp\\.example$', replacement: '사내 도메인', isPattern: true }],
      suggestions: [{ term: 'TB_X', replacement: '집계 테이블', reason: '사내 테이블명' }],
      candidates: [
        { term: 'TB_X', kind: 'UPPER_SNAKE', count: 3, example: 'TB_X 갱신' },
        { term: 'ACME', kind: '대문자', count: 2, example: 'ACME\t원장' },
      ],
    });
    expect(text.split('\n').slice(1, 4)).toEqual([
      '\\.corp\\.example$\t사내 도메인\ty\t\t등록됨',
      'TB_X\t집계 테이블\t\t3\t제안: 사내 테이블명',
      'ACME\t\t\t2\t대문자: ACME 원장',
    ]);

    const edited = text.replace('ACME\t\t', 'ACME\t고객사\t');
    expect(parseTermFile(edited).map((t) => [t.term, t.replacement, t.isPattern])).toEqual([
      ['\\.corp\\.example$', '사내 도메인', true],
      ['TB_X', '집계 테이블', false],
      ['ACME', '고객사', false],
    ]);
  });

  it.each([
    { name: '머리줄이 없으면', text: 'ACME\t고객사\n', error: /머리줄/ },
    { name: '정규식이 틀리면', text: 'term\treplacement\tpattern\n([\t괄호\ty\n', error: /2번째 줄/ },
    { name: '같은 용어가 두 번이면', text: 'term\treplacement\nA\tx\nA\ty\n', error: /두 번/ },
  ])('$name 거부한다', ({ text, error }) => {
    expect(() => parseTermFile(text)).toThrow(error);
  });
});
