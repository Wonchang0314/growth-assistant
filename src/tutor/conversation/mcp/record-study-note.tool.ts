import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../core/mcp/mcp-tool.js';
import { StudyNoteService } from '../study-note.service.js';

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
});

@McpTool()
@Injectable()
export class RecordStudyNoteTool implements McpToolHandler<typeof input> {
  readonly name = 'record_study_note';
  readonly description =
    '튜터링 대화에서 배운 것과 헷갈린 점을 학습 기록으로 남긴다. ' +
    '주제 하나를 마무리했을 때, 사용자가 헷갈린 지점이 분명해졌을 때, 사용자가 답을 보여 달라고 했을 때 부른다. ' +
    '한 대화에서 주제가 여러 개면 주제마다 부른다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly service: StudyNoteService) {}

  async handle(args: z.output<typeof input>): Promise<McpToolResult> {
    const note = await this.service.record(args);
    return {
      text: `학습 기록 #${note.id} 저장: ${note.topic} (헷갈린 점 ${note.confusedPoints.length}개)`,
      data: { id: note.id, topic: note.topic, createdAt: note.createdAt.toISOString() },
    };
  }
}
