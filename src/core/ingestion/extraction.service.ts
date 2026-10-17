import { inspect } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { planConcepts } from '../knowledge/concept-proposal.js';
import { ConceptService } from '../knowledge/concept.service.js';
import { ClaudeClient, ClaudeException } from '../llm/claude.client.js';
import { ExperienceRepository } from '../memory/experience.repository.js';
import { SourceDocumentRepository } from '../memory/source-document.repository.js';
import { EXTRACTION_SYSTEM_PROMPT, extractionPrompt, extractionSchema } from './extraction.js';

export interface ExtractionReport {
  /** 추출을 끝낸 문서 수. */
  readonly done: number;
  readonly cards: number;
  /** 새로 만든 개념 중 자동 승인된 것과 승인 대기로 둔 것. */
  readonly autoApproved: number;
  readonly proposed: number;
  /** 추출하지 못해 FAILED로 둔 문서. 다음 실행이 다시 뽑는다. */
  readonly failed: readonly { readonly title: string; readonly error: string }[];
  /** 사용량 한도나 로그인 문제로 중간에 멈췄으면 그 이유. 남은 문서는 상태를 바꾸지 않는다. */
  readonly stopped: string | null;
}

/** 이 오류는 문서 탓이 아니고 다음 문서도 똑같이 실패하므로 멈춘다. */
const STOP_ERRORS = new Set(['RATE_LIMIT', 'AUTH']);

/**
 * 원문 문서에서 경험 카드를 뽑는다 (설계 문서 7.1의 4~7). 문서마다 `claude -p` 한 번이고, 실패는 문서마다 따로 처리한다.
 * 다시 뽑으면 그 문서의 카드를 통째로 바꾼다.
 */
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly claude: ClaudeClient,
    private readonly documents: SourceDocumentRepository,
    private readonly experiences: ExperienceRepository,
    private readonly concepts: ConceptService,
    private readonly clock: Clock,
  ) {}

  async run(options: { ids?: readonly number[] | undefined; limit?: number | undefined }): Promise<ExtractionReport> {
    const report = { done: 0, cards: 0, autoApproved: 0, proposed: 0 };
    const failed: { title: string; error: string }[] = [];

    for (const document of await this.documents.findForExtraction(options)) {
      try {
        // 앞 문서에서 만든 개념을 다음 문서가 다시 제안하지 않도록 문서마다 새로 읽는다.
        const vocabulary = await this.concepts.vocabulary();
        const extraction = await this.claude.completeStructured(
          {
            purpose: 'EXTRACTION',
            systemPrompt: EXTRACTION_SYSTEM_PROMPT,
            prompt: extractionPrompt(document, vocabulary),
          },
          extractionSchema,
        );
        const plan = planConcepts(vocabulary, extraction.newConcepts);
        const cards = extraction.experiences.map((card) => ({
          ...card,
          concepts: card.concepts.flatMap((name) => plan.resolve(name) ?? []),
        }));
        await this.experiences.saveExtraction({
          documentId: document.id,
          summary: extraction.summary,
          cards,
          newConcepts: plan.newConcepts,
          aliasAdds: plan.aliasAdds,
          now: this.clock.now(),
        });
        report.done += 1;
        report.cards += cards.length;
        report.autoApproved += plan.newConcepts.filter((c) => c.autoApproved).length;
        report.proposed += plan.newConcepts.filter((c) => !c.autoApproved).length;
      } catch (e) {
        if (e instanceof ClaudeException && STOP_ERRORS.has(e.type)) {
          return { ...report, failed, stopped: `${e.type}: ${e.message}` };
        }
        this.logger.warn(`경험 카드 추출 실패: ${document.title} (${document.id}) ${inspect(e)}`);
        const error = e instanceof Error ? e.message : String(e);
        await this.documents.markExtractionFailed(document.id, error);
        failed.push({ title: document.title, error });
      }
    }
    return { ...report, failed, stopped: null };
  }
}
