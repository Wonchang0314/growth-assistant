import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../../core/clock/clock.js';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../core/mcp/mcp-tool.js';
import type { StudyNote } from '../study-note.js';
import { StudyNoteService } from '../study-note.service.js';

const input = z.object({
  topic: z.string().trim().min(1).max(200).describe('사용자가 배우거나 묻는 주제. 예: "트랜잭션 격리 수준"'),
});

@McpTool()
@Injectable()
export class GetLearningContextTool implements McpToolHandler<typeof input> {
  readonly name = 'get_learning_context';
  readonly description =
    '주제에 대한 사용자의 지난 학습 기록(요약, 헷갈렸던 점)과 최근 학습 기록을 가져온다. ' +
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
      `주제 "${topic}"의 지난 학습 기록 ${context.relatedNotes.length}개, 그 밖의 최근 기록 ${context.recentNotes.length}개.`,
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
        relatedNotes: context.relatedNotes.map((n) => this.toData(n)),
        recentNotes: context.recentNotes.map((n) => this.toData(n)),
      },
    };
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
    return date.toLocaleDateString('sv-SE', { timeZone: this.clock.timeZone });
  }
}
