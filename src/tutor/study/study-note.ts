/** 대화 하나에서 남긴 학습 기록 (설계 문서 7.2). 대화 결과로는 숙련도를 바꾸지 않고, 헷갈린 점은 출제 우선순위에만 쓴다. */
export interface StudyNote {
  readonly id: number;
  readonly topic: string;
  readonly summary: string;
  readonly confusedPoints: readonly string[];
  /** 사용자가 답을 직접 보여 달라고 했는지 (교수 규칙의 탈출구, 설계 문서 7.5). */
  readonly answerRevealed: boolean;
  readonly createdAt: Date;
}

export type NewStudyNote = Omit<StudyNote, 'id'>;

/** 학습 기록과 개념의 연결 신호. 헷갈린 개념(CONFUSED)은 출제 우선순위가 오른다. */
export const STUDY_SIGNALS = ['DISCUSSED', 'CONFUSED'] as const;
export type StudySignal = (typeof STUDY_SIGNALS)[number];

export interface StudyNoteConceptLink {
  readonly conceptId: number;
  readonly signal: StudySignal;
}

/**
 * 같은 개념이 여러 번 들어오면(이름과 별칭으로 따로 적는 등) 하나로 합친다. 한 번이라도 CONFUSED면 CONFUSED다.
 */
export function mergeConceptLinks(links: readonly StudyNoteConceptLink[]): StudyNoteConceptLink[] {
  const byConcept = new Map<number, StudySignal>();
  for (const link of links) {
    const prev = byConcept.get(link.conceptId);
    byConcept.set(link.conceptId, prev === 'CONFUSED' ? 'CONFUSED' : link.signal);
  }
  return [...byConcept].map(([conceptId, signal]) => ({ conceptId, signal }));
}

/**
 * 주제 문장을 검색어로 나눈다. "DB 인덱스 설계"처럼 들어와도 "인덱스"만 적힌 기록을 찾기 위해서다.
 * 한 글자 단어는 너무 많이 걸려서 뺀다. 중복을 지우고 최대 5개만 쓴다.
 */
export function searchTermsOf(topic: string): string[] {
  const words = topic
    .split(/[\s,./·()[\]{}"'`!?:;]+/u)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, 5);
}
