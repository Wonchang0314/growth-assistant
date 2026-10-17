import { describe, expect, it } from 'vitest';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { DomainTermService } from './domain-term.service.js';

describe('DomainTermService', () => {
  it('후보와 문서 제목을 함께 넘기고, 같은 용어가 두 번 오면 처음 것만 남긴다', async () => {
    const claude = new FakeClaudeClient().reply(
      JSON.stringify({
        terms: [
          { term: 'TB_X', replacement: '집계 테이블', reason: '사내 테이블명' },
          { term: '가나세탁', replacement: '세탁 프랜차이즈 고객사', reason: '제목의 고객사 이름' },
          { term: 'TB_X', replacement: '다른 표현', reason: '중복' },
        ],
      }),
    );

    const result = await new DomainTermService(claude).suggest(
      [{ term: 'TB_X', kind: 'UPPER_SNAKE', count: 3, example: 'TB_X 갱신' }],
      ['가나세탁 점포 집계 개편'],
    );

    expect(result.map((t) => [t.term, t.replacement])).toEqual([
      ['TB_X', '집계 테이블'],
      ['가나세탁', '세탁 프랜차이즈 고객사'],
    ]);
    const [request] = claude.requestsFor('TERM_SUGGESTION');
    expect(request?.prompt).toContain('TB_X\t3회\tTB_X 갱신');
    expect(request?.prompt).toContain('가나세탁 점포 집계 개편');
  });
});
