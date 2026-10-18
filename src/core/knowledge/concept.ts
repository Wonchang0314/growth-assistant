/** 개념의 승인 상태 (설계 문서 6장). PROPOSED·REJECTED 개념은 숙련도 추적과 출제, 학습 맥락에서 뺀다. */
export const CONCEPT_STATUSES = ['ACTIVE', 'PROPOSED', 'REJECTED'] as const;
export type ConceptStatus = (typeof CONCEPT_STATUSES)[number];

/** 개념이 처음 생긴 곳. */
export const CONCEPT_ORIGINS = ['SEED', 'INGESTION', 'CONVERSATION'] as const;
export type ConceptOrigin = (typeof CONCEPT_ORIGINS)[number];

/**
 * 개념 사이 관계 (from → to).
 * - PART_OF: from이 to의 하위 개념이다.
 * - PREREQUISITE: from을 알려면 to를 먼저 알아야 한다.
 * - RELATED: 서로 관련 있다. 방향이 없어 id가 작은 쪽을 from으로 한 번만 저장한다.
 */
export const CONCEPT_EDGE_TYPES = ['PART_OF', 'PREREQUISITE', 'RELATED'] as const;
export type ConceptEdgeType = (typeof CONCEPT_EDGE_TYPES)[number];

/** 이름 매칭에 쓰는 개념의 이름과 별칭. */
export interface ConceptTerms {
  readonly id: number;
  readonly name: string;
  readonly aliases: readonly string[];
}

export type ConceptRef = Pick<ConceptTerms, 'id' | 'name'>;

/** 학습 맥락에 싣는 개념. */
export interface RelatedConcept {
  readonly id: number;
  readonly name: string;
  readonly track: string;
  readonly description: string;
  /** 상위 개념 이름 (PART_OF). */
  readonly parent: string | null;
  /** 먼저 알아야 하는 개념 이름. 가까운 것부터. */
  readonly prerequisites: readonly string[];
}

/**
 * 비교용으로 이름을 정규화한다. 대소문자, 공백, 가운뎃점, 하이픈 차이를 무시한다.
 * "B-tree 인덱스"와 "btree인덱스", "날짜·시간"과 "날짜 시간"을 같게 본다.
 */
export function normalizeTerm(term: string): string {
  return term
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・_-]+/gu, '');
}

/** 한글 단어 끝에 붙은 조사·어미. "컨테이너에서"를 "컨테이너"로도 본다. 긴 것부터 확인한다. */
const KOREAN_SUFFIXES = [
  '에서',
  '으로',
  '에게',
  '부터',
  '까지',
  '하자',
  '하기',
  '이랑',
  '을',
  '를',
  '이',
  '가',
  '은',
  '는',
  '의',
  '와',
  '과',
  '도',
  '로',
  '에',
];

function tokensOf(text: string): string[] {
  const words = text
    .split(/[\s,./·()[\]{}"'`!?:;]+/u)
    .map(normalizeTerm)
    .filter((t) => t.length > 0);
  const stems = words.flatMap((w) => {
    const suffix = /^\p{Script=Hangul}+$/u.test(w)
      ? KOREAN_SUFFIXES.find((s) => w.endsWith(s) && w.length - s.length >= 2)
      : undefined;
    return suffix === undefined ? [] : [w.slice(0, -suffix.length)];
  });
  return [...new Set([...words, ...stems])];
}

/** 짧은 별칭(JS, DI, OS)이 다른 단어 안에서 잘못 걸리지 않도록, 부분 문자열 매칭은 이 길이부터 한다. */
const MIN_SUBSTRING_LENGTH = 3;

const ASCII_WORD_CHAR = /[a-z0-9]/;

/**
 * 정규화한 주제 안에 용어가 들어 있는지. 영문·숫자로 시작하거나 끝나는 용어는 그쪽 옆이 영문·숫자가 아닐 때만 인정한다
 * ("nest"가 "nestedloop", "tree"가 "btree" 안에서 걸리지 않고, "jpa"는 "jpa를쓸때"에서 걸리게).
 */
function containsTerm(text: string, term: string): boolean {
  if (term.length < MIN_SUBSTRING_LENGTH) return false;
  const isAscii = (char: string | undefined) => ASCII_WORD_CHAR.test(char ?? '');
  for (let i = text.indexOf(term); i !== -1; i = text.indexOf(term, i + 1)) {
    const joinedBefore = isAscii(term.at(0)) && isAscii(text[i - 1]);
    const joinedAfter = isAscii(term.at(-1)) && isAscii(text[i + term.length]);
    if (!joinedBefore && !joinedAfter) return true;
  }
  return false;
}

/**
 * 주제의 단어가 개념 이름 안에 들어 있는지 볼 만한지. 한글은 2글자부터, 영문·숫자는 3글자부터 본다
 * ("JS"가 "NestJS", "JSON" 안에서 걸리지 않게).
 */
function isReverseToken(token: string): boolean {
  return /^[a-z0-9]+$/.test(token) ? token.length >= 3 : token.length >= 2;
}

/**
 * 주제 문장과 관련 있는 개념을 고른다. 이름·별칭이 주제와 얼마나 맞는지로 점수를 매긴다.
 * - 주제 전체와 같으면 가장 높다.
 * - 주제의 한 단어와 같으면 다음이다("PostgreSQL 인덱스" → 별칭 "PostgreSQL").
 * - 3글자 이상이면 주제 안에 들어 있어도 된다("트랜잭션격리수준" → "트랜잭션 격리 수준").
 * - 주제의 단어가 개념 이름 안에 들어 있으면 낮은 점수로 고른다("인덱스" → "복합 인덱스 설계").
 * 점수가 같으면 이름이 짧은(더 일반적인) 개념이 앞선다.
 */
export function matchConcepts(topic: string, concepts: readonly ConceptTerms[], limit: number): ConceptTerms[] {
  const whole = normalizeTerm(topic);
  if (whole.length === 0) return [];
  const tokens = tokensOf(topic);

  const scored = concepts.map((concept) => {
    let best = 0;
    for (const term of [concept.name, ...concept.aliases]) {
      const t = normalizeTerm(term);
      if (t.length === 0) continue;
      if (t === whole) best = Math.max(best, 1000);
      else if (tokens.includes(t)) best = Math.max(best, 500 + t.length);
      else if (containsTerm(whole, t)) best = Math.max(best, 300 + t.length);
    }
    const name = normalizeTerm(concept.name);
    for (const token of tokens) {
      if (isReverseToken(token) && name.includes(token)) best = Math.max(best, 100 + token.length);
    }
    return { concept, score: best, length: name.length };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length || a.concept.id - b.concept.id)
    .slice(0, limit)
    .map((s) => s.concept);
}

/** 이름이나 별칭이 정확히 같은(정규화 기준) 개념을 찾는다. 학습 기록에 개념을 연결할 때 쓴다. */
export function resolveConcept<T extends ConceptTerms>(name: string, concepts: readonly T[]): T | undefined {
  const target = normalizeTerm(name);
  if (target.length === 0) return undefined;
  return (
    concepts.find((c) => normalizeTerm(c.name) === target) ??
    concepts.find((c) => c.aliases.some((a) => normalizeTerm(a) === target))
  );
}
