import { describe, expect, it } from 'vitest';
import { decodeNtfyHeader, fakeNtfyServer } from '../../../test/fakes/fake-ntfy-server.js';
import { NtfyStudyNotifier } from './study-notifier.js';

const ntfy = fakeNtfyServer();

describe('NtfyStudyNotifier', () => {
  it('우선순위 보통·책 태그로 보내고, 누르면 ChatGPT를 여는 링크를 붙인다', async () => {
    await new NtfyStudyNotifier(new URL(`${ntfy.baseUrl}/test-topic`)).notify({ title: '오늘 복습 3개', body: '본문' });

    const [request] = ntfy.received;
    expect(decodeNtfyHeader(request?.headers.title)).toBe('오늘 복습 3개');
    expect(request?.headers).toMatchObject({ priority: 'default', tags: 'books', click: 'https://chatgpt.com/' });
    expect(request?.body).toBe('본문');
  });
});
