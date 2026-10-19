import { Injectable } from '@nestjs/common';
import { ConceptService } from '../../../core/knowledge/concept.service.js';
import { QuizQuestionRepository } from './ports.js';

/** 퀴즈 카드에 보여 줄 객관식 문제. 정답·해설·오개념은 싣지 않는다. 보기 번호는 1부터 순서대로다. */
export interface QuizCard {
  readonly questionId: number;
  readonly concept: string;
  readonly prompt: string;
  readonly choices: readonly string[];
}

/**
 * MCP Apps 시험용 카드 (설계 문서 7.3 "MCP Apps 시험"). 복습 일정·하루 상한과 상관없이 문제 풀에서 객관식 하나를 고른다.
 * 낸 횟수는 올리지 않는다. 답은 평소처럼 `submit_answer`로 채점한다.
 */
@Injectable()
export class QuizCardService {
  constructor(
    private readonly questions: QuizQuestionRepository,
    private readonly concepts: ConceptService,
  ) {}

  async pick(): Promise<QuizCard | undefined> {
    const q = await this.questions.findAnyValid('MULTIPLE_CHOICE');
    if (q?.type !== 'MULTIPLE_CHOICE') return undefined;
    const [concept] = await this.concepts.summaries([q.conceptId]);
    return {
      questionId: q.id,
      concept: concept?.name ?? `개념 ${q.conceptId}`,
      prompt: q.prompt,
      choices: q.choices.map((c) => c.text),
    };
  }
}
