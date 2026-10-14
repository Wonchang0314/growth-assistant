import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { renderReply, TUTOR_SYSTEM, tutorReplySchema, topicOf } from './conversation-prompts.js';

describe('conversation-prompts', () => {
  it('프롬프트 파일을 읽는다', () => {
    expect(TUTOR_SYSTEM).toContain('튜터');
  });

  it('출처는 중복과 빈 URL을 빼고, 링크 미리보기가 뜨지 않게 붙인다', () => {
    const text = renderReply({
      reply: '본문',
      sources: [
        { title: '문서', url: 'https://a.com' },
        { title: '중복', url: 'https://a.com' },
        { title: '빈 주소', url: ' ' },
        { title: '', url: 'https://b.com' },
      ],
      answerRevealed: false,
    });

    expect(text).toBe('본문\n\n**출처**\n- [문서](<https://a.com>)\n- [https://b.com](<https://b.com>)');
  });

  it('출처가 없으면 본문만 돌려준다', () => {
    expect(renderReply({ reply: '본문', sources: [], answerRevealed: false })).toBe('본문');
  });

  it('첫 메시지의 첫 줄을 100자까지 주제로 쓴다', () => {
    expect(topicOf('\n  격리 수준  \n둘째 줄')).toBe('격리 수준');
    expect(topicOf('가'.repeat(150))).toHaveLength(100);
    expect(topicOf('   ')).toBe('튜터 대화');
  });

  it('응답 스키마는 정해진 필드만 허용한다 (CLI에 넘기는 JSON Schema의 additionalProperties: false)', () => {
    expect(z.toJSONSchema(tutorReplySchema)).toMatchObject({
      required: ['reply', 'sources', 'answerRevealed'],
      additionalProperties: false,
    });
  });
});
