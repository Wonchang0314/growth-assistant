import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../core/mcp/mcp-tool.js';
import { StudyNoteService } from '../study-note.service.js';
import { experienceHeading } from './experience-text.js';

const input = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('찾을 경험의 개념이나 키워드. 예: "인덱스를 못 탄 쿼리", "배포 장애", "keepPreviousData"'),
  limit: z.number().int().min(1).max(10).default(5).describe('돌려받을 카드 수'),
});

@McpTool()
@Injectable()
export class SearchExperienceTool implements McpToolHandler<typeof input> {
  readonly name = 'search_experience';
  readonly description =
    '사용자가 실무에서 겪은 경험 카드(Notion 복습 문서에서 뽑은 상황·과제·행동·결과·교훈)를 개념과 키워드로 찾는다. ' +
    '사용자가 "내가 겪은 X 사례", "면접에서 말할 경험"처럼 자기 경험을 찾을 때, 또는 get_learning_context의 경험 카드보다 자세한 내용이 필요할 때 부른다.';
  readonly inputSchema = input;
  readonly readOnly = true;

  constructor(private readonly service: StudyNoteService) {}

  async handle({ query, limit }: z.output<typeof input>): Promise<McpToolResult> {
    const experiences = await this.service.searchExperiences(query, limit);
    if (experiences.length === 0) {
      return { text: `"${query}"로 찾은 경험 카드가 없다.`, data: { query, experiences } };
    }
    const cards = experiences.map((e) =>
      [
        `## ${experienceHeading(e)}`,
        `상황: ${e.situation}`,
        `과제: ${e.task}`,
        `행동: ${e.action}`,
        `결과: ${e.result}`,
        `교훈: ${e.lesson}`,
        e.document && `원문: ${e.document.title} ${e.document.url}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    return {
      text: `"${query}"로 찾은 경험 카드 ${experiences.length}장\n\n${cards.join('\n\n')}`,
      data: { query, experiences },
    };
  }
}
