import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeClient } from '../llm/claude.client.js';
import type { TermCandidate, TermSuggestion } from './domain-term.js';

const suggestionSchema = z.object({
  terms: z.array(
    z.object({
      term: z.string().min(1).describe('후보 목록의 용어를 글자 그대로, 또는 문서 제목에서 찾은 고유명'),
      replacement: z.string().min(1).describe('회사 맥락을 모르는 사람도 알아듣는 일반 표현. 역할을 설명한다'),
      reason: z.string().min(1).describe('회사 고유 용어라고 본 이유 한 줄'),
    }),
  ),
});

/**
 * 용어 후보 중 회사 고유 용어를 Claude가 골라 일반 표현을 붙인다. 사용자가 파일에서 확인한 뒤에만 등록된다.
 * 코드 패턴은 영문 모양만 찾으므로 한글 고유명(회사·고객사·사내 시스템 이름)은 문서 제목에서 함께 찾게 한다.
 */
@Injectable()
export class DomainTermService {
  constructor(private readonly claude: ClaudeClient) {}

  async suggest(candidates: readonly TermCandidate[], titles: readonly string[]): Promise<TermSuggestion[]> {
    const list = candidates.map((c) => `${c.term}\t${c.count}회\t${c.example.slice(0, 80)}`).join('\n');
    const result = await this.claude.completeStructured(
      {
        purpose: 'TERM_SUGGESTION',
        systemPrompt:
          '너는 개발자의 업무 기록에서 회사 고유 정보를 걷어내는 일을 돕는다. 걷어낸 기록은 회사 밖 사람도 풀 수 있는 학습 문제가 된다.',
        prompt: [
          '아래는 한 개발자의 업무·공부 기록에서 코드가 뽑은 용어 후보(용어, 나온 횟수, 앞뒤 글)와 문서 제목이다.',
          '회사 밖 사람이 모르는 회사 고유 용어만 골라라: 회사·고객사·협력사 이름, 사내 시스템·서비스 이름, 사내 테이블·컬럼·코드값, 사내 서버 주소와 도메인, 회사가 쓰는 외부 데이터 상품 이름.',
          '고르지 않는 것: SQL 키워드, HTTP 메서드, 널리 쓰는 기술 약어와 제품 이름(API, JSON, AWS, MSSQL, GIS, ERP 같은 것), 일반적인 환경 변수와 상수 이름.',
          '후보에 없는 한글 고유명이 문서 제목에 있으면 함께 넣어라. term은 후보나 제목에 나온 글자 그대로 쓴다.',
          'replacement는 역할을 설명하는 일반 표현으로 쓴다 (예: 매장 일별 집계 테이블, 세탁 프랜차이즈 고객사, 외부 부동산 매물 데이터).',
          '',
          '## 용어 후보',
          list,
          '',
          '## 문서 제목',
          titles.join('\n'),
        ].join('\n'),
      },
      suggestionSchema,
    );
    const seen = new Set<string>();
    return result.terms.filter((t) => !seen.has(t.term) && seen.add(t.term));
  }
}
