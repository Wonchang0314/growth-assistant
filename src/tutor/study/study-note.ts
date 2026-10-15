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
