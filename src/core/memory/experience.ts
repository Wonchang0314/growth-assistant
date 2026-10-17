import { z } from 'zod';

/** 경험 카드가 나온 곳. 대화에서 드러난 경험은 원문 문서 없이 남는다. */
export const EXPERIENCE_ORIGINS = ['DOCUMENT', 'CONVERSATION'] as const;
export type ExperienceOrigin = (typeof EXPERIENCE_ORIGINS)[number];

/** 경험 카드 본문 (STAR+L, 설계 문서 5.2). 추출 응답의 모양이기도 해서 필드 설명이 프롬프트로 쓰인다. */
export const experienceCardSchema = z.object({
  projectName: z.string().nullable().describe('프로젝트 이름. 문서에 없으면 null'),
  title: z.string().min(1).describe('경험을 한 줄로 요약한 제목'),
  situation: z.string().describe('상황: 어떤 시스템과 조건에서 무슨 일이 있었나'),
  task: z.string().describe('과제: 해결하거나 결정해야 했던 것'),
  action: z.string().describe('행동: 내가 실제로 한 일. 틀린 판단과 되돌린 결정도 그대로 쓴다'),
  result: z.string().describe('결과: 무엇이 어떻게 됐나. 수치가 있으면 적는다'),
  lesson: z.string().describe('교훈: 다른 상황에도 쓸 수 있는 원칙 한두 개'),
  occurredAt: z.iso.date().nullable().describe('경험한 날짜(YYYY-MM-DD). 문서에 날짜가 없으면 null'),
});
export type ExperienceCard = z.infer<typeof experienceCardSchema>;
