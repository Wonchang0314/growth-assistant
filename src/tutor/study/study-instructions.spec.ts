import { describe, expect, it } from 'vitest';
import { ListPendingConceptsTool } from '../../core/ingestion/mcp/list-pending-concepts.tool.js';
import { ReviewConceptTool } from '../../core/ingestion/mcp/review-concept.tool.js';
import { GetLearningContextTool } from './mcp/get-learning-context.tool.js';
import { RecordStudyNoteTool } from './mcp/record-study-note.tool.js';
import { SearchExperienceTool } from './mcp/search-experience.tool.js';
import { STUDY_INSTRUCTIONS } from './study-instructions.js';

// 지침이 이름으로 가리키므로, 도구 이름·입력 필드를 바꾸면 지침도 함께 고치도록 여기서 잡는다.
const recordTool = new RecordStudyNoteTool(undefined as never);

describe('STUDY_INSTRUCTIONS', () => {
  it('지침에 적힌 도구 이름이 실제 도구 이름과 같다', () => {
    const tools = [
      new GetLearningContextTool(undefined as never, undefined as never),
      recordTool,
      new SearchExperienceTool(undefined as never),
      new ListPendingConceptsTool(undefined as never),
      new ReviewConceptTool(undefined as never),
    ];

    for (const { name } of tools) expect(STUDY_INSTRUCTIONS).toContain(`\`${name}\``);
  });

  it('지침에 적힌 입력 필드가 기록 도구의 입력 스키마에 있다', () => {
    const fields = Object.keys(recordTool.inputSchema.shape);

    for (const field of ['summary', 'confusedPoints', 'answerRevealed', 'concepts']) {
      expect(fields).toContain(field);
      expect(STUDY_INSTRUCTIONS).toContain(`\`${field}`);
    }
  });
});
