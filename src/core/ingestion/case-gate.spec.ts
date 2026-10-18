import { describe, expect, it } from 'vitest';
import { findLeaks } from './case-gate.js';

describe('findLeaks', () => {
  it.each([
    ['IP 주소', '배포 서버 10.20.30.40에 접속했다', ['10.20.30.40']],
    ['URL', '문서는 https://wiki.example.com/page 에 있다', ['https://wiki.example.com/page']],
    ['도메인', 'api.acme.co.kr 로 요청이 갔다', ['api.acme.co.kr']],
    ['UPPER_SNAKE 식별자', 'CUSTOMER_EXT 테이블과 STATUS_CD 컬럼', ['CUSTOMER_EXT', 'STATUS_CD']],
  ])('%s를 찾는다', (_, text, leaks) => {
    expect(findLeaks(text)).toEqual(leaks);
  });

  it('일반 기술 표기는 걸지 않는다', () => {
    expect(
      findLeaks('Node.js에서 package.json을 고치고 B-tree 인덱스, HTTP 200, v1.2.3, SQL의 COUNT(*)와 ROLLBACK을 썼다'),
    ).toEqual([]);
  });

  it('같은 문자열은 한 번만 돌려준다', () => {
    expect(findLeaks('ORDER_LOG에서 ORDER_LOG로')).toEqual(['ORDER_LOG']);
  });
});
