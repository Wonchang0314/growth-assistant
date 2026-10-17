import type { FoundExperience } from '../../../core/memory/experience.repository.js';

/** 경험 카드 한 줄 머리: "제목 (프로젝트, 날짜)". 없는 값은 뺀다. */
export function experienceHeading(experience: FoundExperience): string {
  const meta = [experience.projectName, experience.occurredAt].filter((v) => v !== null);
  return meta.length > 0 ? `${experience.title} (${meta.join(', ')})` : experience.title;
}
