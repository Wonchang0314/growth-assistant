import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** [dir]/prompts/[name].md 시스템 프롬프트. 빌드할 때 dist로 함께 복사한다 (nest-cli.json). */
export const loadPrompt = (dir: string, name: string): string =>
  readFileSync(join(dir, 'prompts', `${name}.md`), 'utf8').trim();

/** 비어 있으면 빼는 `## 제목` 아래 목록. 프롬프트 조각을 배열로 모을 때 펼쳐 넣는다. */
export const listSection = (title: string, items: readonly string[]): string[] =>
  items.length === 0 ? [] : [`## ${title}\n${items.map((i) => `- ${i}`).join('\n')}`];
