import { describe, expect, it } from 'vitest';
import { splitMessage } from './message-splitter.js';

const isHighSurrogate = (s: string) => {
  const code = s.charCodeAt(s.length - 1);
  return code >= 0xd800 && code <= 0xdbff;
};

describe('splitMessage', () => {
  it('제한 이하면 그대로 한 조각이다', () => {
    expect(splitMessage('짧은 답')).toEqual(['짧은 답']);
  });

  it('줄바꿈 경계에서 나누고 모든 조각이 제한 이하다', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `문단 ${i + 1} ` + '가'.repeat(90));

    const chunks = splitMessage(paragraphs.join('\n'), 500);

    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    expect(chunks.flatMap((c) => c.split('\n'))).toEqual(paragraphs);
  });

  it('줄바꿈이 없으면 공백에서 나눈다', () => {
    const words = Array.from({ length: 200 }, (_, i) => `단어${i + 1}`);

    const chunks = splitMessage(words.join(' '), 100);

    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.flatMap((c) => c.split(' '))).toEqual(words);
  });

  it('코드 블록이 나뉘면 닫고 같은 언어로 다시 연다', () => {
    const code = Array.from({ length: 40 }, (_, i) => `    const x${i + 1} = ${i + 1};`).join('\n');
    const text = `설명\n\`\`\`ts\n${code}\n\`\`\`\n끝`;

    const chunks = splitMessage(text, 300);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 300)).toBe(true);
    for (const c of chunks.slice(0, -1)) expect(c.endsWith('\n```'), `닫히지 않은 조각: ${c}`).toBe(true);
    for (const c of chunks.slice(1, -1)) expect(c.startsWith('```ts\n'), `다시 열지 않은 조각: ${c}`).toBe(true);
    // 들여쓰기가 보존된다.
    expect(chunks.join('\n')).toContain('    const x40 = 40;');
  });

  it('구분할 곳이 없으면 글자 단위로 자르되 이모지를 가르지 않는다', () => {
    const text = '😀'.repeat(200);

    const chunks = splitMessage(text, 101);

    expect(chunks.every((c) => c.length <= 101 && !isHighSurrogate(c))).toBe(true);
    expect(chunks.join('')).toBe(text);
  });
});
