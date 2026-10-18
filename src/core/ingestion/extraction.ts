import { z } from 'zod';
import { loadPrompt } from '../llm/prompt.js';
import { conceptProposalSchema, type Vocabulary } from '../knowledge/concept-proposal.js';
import { experienceCardSchema } from '../memory/experience.js';

/** 문서 하나에서 뽑은 결과 (설계 문서 7.1의 4). 이 스키마가 `--json-schema`로 그대로 Claude에 간다. */
export const extractionSchema = z.object({
  summary: z.string().describe('문서가 다루는 내용을 3~5문장으로 요약'),
  experiences: z.array(
    experienceCardSchema.extend({
      concepts: z
        .array(z.string())
        .describe('이 경험이 다룬 개념 이름. 개념 목록이나 newConcepts에 있는 이름을 그대로 쓴다'),
    }),
  ),
  newConcepts: z.array(conceptProposalSchema).describe('개념 목록에 없지만 경험을 설명하는 데 필요한 개념'),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** 추출 규칙. 매 호출 같은 내용이라 시스템 프롬프트로 넘긴다. */
export const EXTRACTION_SYSTEM_PROMPT = loadPrompt(import.meta.dirname, 'extraction');

/** 추출 호출의 입력: 트랙, 개념 목록(거절된 개념은 뺀다), 문서 본문. */
export function extractionPrompt(
  document: { title: string; chunks: readonly string[] },
  vocabulary: Vocabulary,
): string {
  const concepts = vocabulary.concepts
    .filter((c) => c.status !== 'REJECTED')
    .map((c) => `- ${c.name} (${c.track})${c.aliases.length > 0 ? ` 별칭: ${c.aliases.join(', ')}` : ''}`);
  return [
    `## 트랙\n${vocabulary.tracks.join(', ')}`,
    `## 개념 목록\n${concepts.join('\n')}`,
    `## 문서: ${document.title}\n\n${document.chunks.join('\n\n')}`,
  ].join('\n\n');
}
