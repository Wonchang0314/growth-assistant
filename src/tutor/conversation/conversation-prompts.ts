import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ConversationMessage } from './session.js';

/*
 * 프롬프트 조립. 순수 함수로 두어 Discord·CLI 없이 확인한다.
 * 프롬프트 본문은 `prompts/*.md`에 두고, 빌드할 때 dist로 함께 복사한다 (nest-cli.json).
 */

export const TUTOR_SYSTEM = prompt('tutor-system.md');
export const SUMMARY_SYSTEM = prompt('session-summary.md');

/** 튜터 응답 스키마 (ADR-0012: 출처는 스키마로 받는다). CLI에 넘기는 JSON Schema도 여기서 만든다. */
export const tutorReplySchema = z.strictObject({
  reply: z.string(),
  sources: z.array(z.strictObject({ title: z.string(), url: z.string() })),
  answerRevealed: z.boolean(),
});

export type TutorReply = z.infer<typeof tutorReplySchema>;

const TOPIC_MAX = 100;

/** 첫 메시지의 첫 줄을 주제로 쓴다. 스레드 이름에도 쓴다(Discord 제한 100자). */
export function topicOf(message: string): string {
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
  return firstLine?.slice(0, TOPIC_MAX) ?? '튜터 대화';
}

export function tutorPrompt(
  topic: string | null,
  summary: string | null,
  recent: readonly ConversationMessage[],
  message: string,
): string {
  return [
    topic === null ? undefined : section('대화 주제', topic),
    summary === null ? undefined : section('이전 대화 요약', summary),
    recent.length === 0 ? undefined : section('최근 대화', transcript(recent)),
    section('이번 메시지', message),
  ]
    .filter((s) => s !== undefined)
    .join('\n\n');
}

export function summaryPrompt(previous: string | null, messages: readonly ConversationMessage[]): string {
  return [previous === null ? undefined : section('이전 요약', previous), section('새 대화', transcript(messages))]
    .filter((s) => s !== undefined)
    .join('\n\n');
}

/** 본문 뒤에 출처 목록을 붙인다. `<url>`로 감싸 Discord 링크 미리보기를 끈다. */
export function renderReply(reply: TutorReply): string {
  const seen = new Set<string>();
  const sources = reply.sources.filter((s) => {
    if (s.url.trim() === '' || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  if (sources.length === 0) return reply.reply;
  const links = sources.map((s) => `- [${s.title.trim() || s.url}](<${s.url}>)`).join('\n');
  return `${reply.reply}\n\n**출처**\n${links}`;
}

function transcript(messages: readonly ConversationMessage[]): string {
  const speaker = { USER: '사용자', TUTOR: '튜터' } as const;
  return messages.map((m) => `${speaker[m.role]}: ${m.content}`).join('\n');
}

function section(title: string, body: string): string {
  return `[${title}]\n${body.trim()}`;
}

function prompt(file: string): string {
  return readFileSync(join(import.meta.dirname, 'prompts', file), 'utf8').trim();
}
