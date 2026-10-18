import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock, localDate } from '../../../../core/clock/clock.js';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../../core/mcp/mcp-tool.js';
import { QuizWeaknessService, type WeakConcept } from '../../application/quiz-weakness.service.js';
import type { RootCause } from '../../domain/root-cause.js';

const input = z.object({});

const LEVEL_TEXT = { WEAK: '약점', UNMEASURED: '미측정', UNSTUDIED: '다룬 적 없음' } as const;

@McpTool()
@Injectable()
export class GetWeaknessTool implements McpToolHandler<typeof input> {
  readonly name = 'get_weakness';
  readonly description =
    '퀴즈 풀이로 계산한 약점을 보여 준다: 트랙별 약점 상위 개념(숙련도, 반복한 오개념, 다음 복습일), ' +
    '약점 개념들이 먼저 알아야 하는 개념 중 약하거나 아직 확인하지 않은 근본 원인 후보, 아직 측정하지 못한 개념 수. ' +
    '사용자가 "내 약점 뭐야", "뭐부터 다시 봐야 해"라고 하면 부른다.';
  readonly inputSchema = input;
  readonly readOnly = true;

  constructor(
    private readonly weakness: QuizWeaknessService,
    private readonly clock: Clock,
  ) {}

  async handle(): Promise<McpToolResult> {
    const report = await this.weakness.report();
    const sections = [
      report.tracks.length === 0
        ? '약점 개념 없음 (채점이 2회 이상이고 약점 점수가 0.5 이상인 개념)'
        : report.tracks
            .map((t) => `## ${t.track}\n${t.concepts.map((c) => `- ${this.describe(c)}`).join('\n')}`)
            .join('\n\n'),
      ...(report.rootCauses.length === 0
        ? []
        : [
            `## 근본 원인 후보 (먼저 다시 볼 개념)\n${report.rootCauses.map((c) => `- ${describeCause(c)}`).join('\n')}`,
          ]),
      `아직 측정하지 못한 개념(채점 2회 미만): ${report.unmeasured}개`,
    ];
    return {
      text: sections.join('\n\n'),
      data: {
        tracks: report.tracks.map((t) => ({
          track: t.track,
          concepts: t.concepts.map((c) => ({
            name: c.name,
            masteryScore: c.mastery.masteryScore,
            weaknessScore: c.mastery.weaknessScore,
            gradedAttempts: c.mastery.gradedAttempts,
            nextReview: localDate(c.mastery.dueAt, this.clock.timeZone),
            repeatedMisconceptions: c.repeatedMisconceptions,
          })),
        })),
        rootCauses: report.rootCauses.map((c) => ({
          name: c.concept.name,
          level: c.level,
          dependents: c.dependents.map((d) => d.name),
        })),
        unmeasured: report.unmeasured,
      },
    };
  }

  private describe(c: WeakConcept): string {
    const misconceptions =
      c.repeatedMisconceptions.length === 0 ? '' : ` / 반복한 오개념: ${c.repeatedMisconceptions.join('; ')}`;
    return (
      `${c.name}: 숙련도 ${c.mastery.masteryScore.toFixed(2)}, 약점 ${c.mastery.weaknessScore.toFixed(2)} ` +
      `(채점 ${c.mastery.gradedAttempts}회), 다음 복습 ${localDate(c.mastery.dueAt, this.clock.timeZone)}${misconceptions}`
    );
  }
}

const describeCause = (c: RootCause) =>
  `${c.concept.name} [${LEVEL_TEXT[c.level]}] ← ${c.dependents.map((d) => d.name).join(', ')}의 선수 개념`;
