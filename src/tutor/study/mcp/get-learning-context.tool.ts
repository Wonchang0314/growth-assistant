import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock, localDate } from '../../../core/clock/clock.js';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../core/mcp/mcp-tool.js';
import { MASTERY_TIER_TEXT, masteryTier } from '../../mastery/mastery.js';
import { PREREQUISITE_LEVEL_TEXT, type WeakPrerequisite } from '../../mastery/root-cause.js';
import type { StudyNote } from '../study-note.js';
import { type ContextConcept, StudyNoteService } from '../study-note.service.js';
import { experienceHeading } from './experience-text.js';

const input = z.object({
  topic: z.string().trim().min(1).max(200).describe('사용자가 배우거나 묻는 주제. 예: "가용재고 계산"'),
});

@McpTool()
@Injectable()
export class GetLearningContextTool implements McpToolHandler<typeof input> {
  readonly name = 'get_learning_context';
  readonly description =
    '주제와 관련된 개념(상위 개념, 먼저 알아야 할 개념, 숙련도 약함·보통·높음·미측정과 다음 복습일, ' +
    '약하거나 아직 확인하지 않은 선수 개념과 그중 근본 원인 후보), 그 개념을 실무에서 겪은 사용자의 경험 카드(제목, 교훈), ' +
    '사용자의 지난 학습 기록(요약, 헷갈렸던 점), 최근 학습 기록을 가져온다. ' +
    '튜터링 대화에서 새 주제를 시작할 때, 설명하기 전에 먼저 부른다. 지난번에 헷갈린 점이 있으면 그 지점부터 확인한다.';
  readonly inputSchema = input;
  readonly readOnly = true;

  constructor(
    private readonly service: StudyNoteService,
    private readonly clock: Clock,
  ) {}

  async handle({ topic }: z.output<typeof input>): Promise<McpToolResult> {
    const context = await this.service.learningContext(topic);
    const lines = [
      `주제 "${topic}"의 관련 개념 ${context.concepts.length}개, 경험 카드 ${context.experiences.length}장, 지난 학습 기록 ${context.relatedNotes.length}개, 그 밖의 최근 기록 ${context.recentNotes.length}개.`,
      ...context.concepts.map((c) => `- [개념] ${this.describeConcept(c)}`),
      ...context.experiences.map((e) => `- [경험] ${experienceHeading(e)}: ${e.lesson}`),
      ...context.relatedNotes.map((n) => `- [관련] ${this.describe(n)}`),
      ...context.recentNotes.map((n) => `- [최근] ${this.describe(n)}`),
    ];
    if (context.relatedNotes.length === 0 && context.recentNotes.length === 0) {
      lines.push('아직 학습 기록이 없다. 사용자가 이 주제를 얼마나 아는지 먼저 물어본다.');
    }
    return {
      text: lines.join('\n'),
      data: {
        topic,
        concepts: context.concepts.map((c) => ({
          name: c.name,
          track: c.track,
          description: c.description,
          parent: c.parent,
          prerequisites: c.prerequisites.map((p) => p.name),
          mastery: masteryTier(c.mastery),
          nextReview: c.mastery ? this.localDate(c.mastery.dueAt) : null,
          weakPrerequisites: c.weakPrerequisites.map((w) => ({
            name: w.concept.name,
            level: w.level,
            rootCauseOf: w.dependents.map((d) => d.name),
          })),
        })),
        experiences: context.experiences.map((e) => ({
          id: e.id,
          title: e.title,
          projectName: e.projectName,
          occurredAt: e.occurredAt,
          situation: e.situation,
          lesson: e.lesson,
          document: e.document,
        })),
        relatedNotes: context.relatedNotes.map((n) => this.toData(n)),
        recentNotes: context.recentNotes.map((n) => this.toData(n)),
      },
    };
  }

  private describeConcept(concept: ContextConcept): string {
    const parent = concept.parent ? ` (상위: ${concept.parent})` : '';
    const prerequisites =
      concept.prerequisites.length > 0
        ? ` / 먼저 알아야 할 개념: ${concept.prerequisites.map((p) => p.name).join(', ')}`
        : '';
    const review = concept.mastery ? `, 다음 복습 ${this.localDate(concept.mastery.dueAt)}` : '';
    const weak =
      concept.weakPrerequisites.length > 0
        ? ` / 약한 선수 개념: ${concept.weakPrerequisites.map(describeWeak).join(', ')}`
        : '';
    return (
      `${concept.name} [${concept.track}]${parent}: ${concept.description}${prerequisites}` +
      ` / 숙련도 ${MASTERY_TIER_TEXT[masteryTier(concept.mastery)]}${review}${weak}`
    );
  }

  private describe(note: StudyNote): string {
    const confused = note.confusedPoints.length > 0 ? ` / 헷갈린 점: ${note.confusedPoints.join('; ')}` : '';
    return `${this.localDate(note.createdAt)} ${note.topic}: ${note.summary}${confused}`;
  }

  private toData(note: StudyNote) {
    return {
      id: note.id,
      topic: note.topic,
      summary: note.summary,
      confusedPoints: note.confusedPoints,
      answerRevealed: note.answerRevealed,
      date: this.localDate(note.createdAt),
    };
  }

  /** 사용자 시간대의 날짜 (`2026-10-15`). */
  private localDate(date: Date): string {
    return localDate(date, this.clock.timeZone);
  }
}

/** "이름(미측정)", 근본 원인 후보면 "이름(다룬 적 없음) 근본 원인 후보(기대는 약점 2개)". */
function describeWeak(w: WeakPrerequisite): string {
  const cause = w.dependents.length > 0 ? ` 근본 원인 후보(기대는 약점 ${w.dependents.length}개)` : '';
  return `${w.concept.name}(${PREREQUISITE_LEVEL_TEXT[w.level]})${cause}`;
}
