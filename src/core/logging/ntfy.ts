import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

const TIMEOUT_MS = 5_000;

/** ntfy 알림 하나. 메시지는 ntfy 서버를 평문으로 지나가므로 개인 내용(이메일, 문제 본문 등)은 싣지 않는다. */
export interface NtfyMessage {
  readonly title: string;
  readonly body: string;
  readonly priority: 'urgent' | 'high' | 'default';
  /** ntfy 태그(쉼표 구분). 알림 앞에 이모지로 보인다. */
  readonly tags: string;
}

/** `<NTFY_URL>/<NTFY_TOPIC>`. 토픽이 없으면 undefined(알림을 로그로만 남긴다). 토픽을 아는 사람은 누구나 구독할 수 있으므로 로그에 남기지 않는다. */
export function ntfyTopicUrl(config: ConfigService<Env, true>): URL | undefined {
  const topic = config.get('NTFY_TOPIC', { infer: true });
  if (!topic) return undefined;
  return new URL(`${config.get('NTFY_URL', { infer: true })}/${encodeURIComponent(topic)}`);
}

/** ntfy 토픽으로 휴대폰에 보낸다. 응답이 실패이거나 5초 안에 닿지 않으면 던진다. */
export async function publishNtfy(topicUrl: URL, message: NtfyMessage): Promise<void> {
  const res = await fetch(topicUrl, {
    method: 'POST',
    headers: { Title: encodeHeader(message.title), Priority: message.priority, Tags: message.tags },
    body: message.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** HTTP 헤더에는 ASCII만 실을 수 있어 한국어 제목을 RFC 2047로 감싼다. ntfy가 풀어서 보여 준다. */
const encodeHeader = (value: string) => `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
