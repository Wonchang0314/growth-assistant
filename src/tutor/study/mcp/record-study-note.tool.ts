import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../core/mcp/mcp-tool.js';
import { StudyNoteService } from '../study-note.service.js';
import { STUDY_SIGNALS } from '../study-note.js';

const input = z.object({
  topic: z.string().trim().min(1).max(200).describe('학습한 주제. 예: "PostgreSQL 인덱스와 선택도"'),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe('사용자가 이해한 내용과 대화의 결론. 다음 대화에서 이어 갈 수 있을 만큼 구체적으로'),
  confusedPoints: z
    .array(z.string().trim().min(1).max(500))
    .max(10)
    .default([])
    .describe(
      '사용자가 헷갈리거나 잘못 알고 있던 점. 한 항목에 하나씩, 틀린 믿음을 문장으로. 다음 복습 문제가 이 지점을 겨냥한다',
    ),
  answerRevealed: z.boolean().default(false).describe('사용자가 답을 직접 보여 달라고 해서 답을 알려 줬으면 true'),
  concepts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100).describe('개념 이름. get_learning_context가 돌려준 이름을 그대로 쓴다'),
        signal: z
          .enum(STUDY_SIGNALS)
          .default('DISCUSSED')
          .describe('사용자가 이 개념을 헷갈렸거나 잘못 알고 있었으면 CONFUSED, 아니면 DISCUSSED'),
      }),
    )
    .max(10)
    .default([])
    .describe('이 대화에서 다룬 개념. 헷갈린 개념(CONFUSED)은 다음 복습에서 먼저 나온다'),
});

@McpTool()
@Injectable()
export class RecordStudyNoteTool implements McpToolHandler<typeof input> {
  readonly name = 'record_study_note';
  readonly description =
    '튜터링 대화에서 배운 것과 헷갈린 점을 학습 기록으로 남기고, 다룬 개념에 연결한다. ' +
    '주제 하나를 마무리했을 때, 사용자가 헷갈린 지점이 분명해졌을 때, 사용자가 답을 보여 달라고 했을 때 부른다. ' +
    '한 대화에서 주제가 여러 개면 주제마다 부른다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly service: StudyNoteService) {}

  async handle(args: z.output<typeof input>): Promise<McpToolResult> {
    const { note, linkedConcepts, unknownConcepts } = await this.service.record(args);
    const lines = [
      `학습 기록 #${note.id} 저장: ${note.topic} (헷갈린 점 ${note.confusedPoints.length}개, 연결한 개념 ${linkedConcepts.length}개)`,
    ];
    if (unknownConcepts.length > 0) {
      lines.push(`개념 목록에 없어 연결하지 않음: ${unknownConcepts.join(', ')}`);
    }
    return {
      text: lines.join('\n'),
      data: {
        id: note.id,
        topic: note.topic,
        createdAt: note.createdAt.toISOString(),
        concepts: linkedConcepts,
        unknownConcepts,
      },
    };
  }
}
