import { normalizeTerm } from '../knowledge/concept.js';

/**
 * 회사 고유 용어와 그 일반 표현 (설계 문서 5.2, ADR-0021). 판단 사례를 추상화할 때 치환에 쓰고, 금지어 게이트가 검사에 쓴다.
 * 레포에 남기지 않도록 DB에만 두고, 사용자는 레포 밖 TSV 파일로 고쳐 `npm run terms -- import`로 반영한다.
 */
export interface DomainTermInput {
  readonly term: string;
  readonly replacement: string;
  /** true면 [term]을 정규식으로 본다 (예: 사내 도메인 `\.corp\.example$`). */
  readonly isPattern: boolean;
}

/** 회사 고유 이름일 가능성이 높은 모양. 코드가 찾는 건 후보일 뿐이고, 고르는 건 사용자다. */
const CANDIDATE_PATTERNS: readonly { readonly kind: string; readonly regex: RegExp }[] = [
  { kind: 'UPPER_SNAKE', regex: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g },
  { kind: 'IP', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: '도메인', regex: /\b(?:[a-z0-9-]+\.)+(?:com|net|io|kr|local|internal)\b/gi },
  { kind: '대문자', regex: /\b[A-Z][A-Z0-9]{2,}\b/g },
];

export interface TermCandidate {
  readonly term: string;
  readonly kind: string;
  /** 나온 횟수. */
  readonly count: number;
  /** 처음 나온 곳 앞뒤 글. */
  readonly example: string;
}

/**
 * 청크에서 용어 후보를 모은다. 개념 이름·별칭(SQL, API 같은 일반 기술 용어)과 이미 등록한 용어는 뺀다.
 * 여러 패턴에 걸리면 먼저 걸린 패턴으로 센다(`TB_STORE`는 UPPER_SNAKE이지 대문자 단어 둘이 아니다).
 */
export function termCandidates(chunks: readonly string[], known: readonly string[]): TermCandidate[] {
  const skip = new Set(known.map(normalizeTerm));
  const found = new Map<string, { kind: string; count: number; example: string }>();
  for (const chunk of chunks) {
    const taken: [number, number][] = [];
    for (const { kind, regex } of CANDIDATE_PATTERNS) {
      for (const m of chunk.matchAll(regex)) {
        const start = m.index;
        const end = start + m[0].length;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        if (skip.has(normalizeTerm(m[0]))) continue;
        const entry = found.get(m[0]);
        if (entry) entry.count += 1;
        else found.set(m[0], { kind, count: 1, example: around(chunk, start, end) });
      }
    }
  }
  return [...found.entries()]
    .map(([term, e]) => ({ term, ...e }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

function around(text: string, start: number, end: number): string {
  return text
    .slice(Math.max(0, start - 30), end + 30)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 용어 파일(TSV) 머리줄. 사용자가 고치는 칸은 앞의 셋이다. */
export const TERM_FILE_HEADER = ['term', 'replacement', 'pattern', 'count', 'example'] as const;

/** Claude가 회사 고유 용어라고 본 후보와 그 일반 표현. */
export interface TermSuggestion {
  readonly term: string;
  readonly replacement: string;
  readonly reason: string;
}

/**
 * 용어 파일을 만든다. 등록된 용어, Claude가 일반 표현을 채운 제안, 나머지 후보(일반 표현 빈칸) 순서다.
 * [replacement]가 빈 줄은 가져올 때 건너뛰므로, 사용자가 제안을 확인하고 남긴 줄만 등록된다.
 */
export function toTermFile(input: {
  existing: readonly DomainTermInput[];
  suggestions: readonly TermSuggestion[];
  candidates: readonly TermCandidate[];
}): string {
  const clean = (s: string) => s.replace(/[\t\n]/g, ' ');
  const counts = new Map(input.candidates.map((c) => [c.term, c]));
  const suggested = new Set(input.suggestions.map((s) => s.term));
  const rows = [
    ...input.existing.map((t) => [t.term, t.replacement, t.isPattern ? 'y' : '', '', '등록됨']),
    ...input.suggestions.map((s) => [
      s.term,
      s.replacement,
      '',
      String(counts.get(s.term)?.count ?? ''),
      `제안: ${s.reason}`,
    ]),
    ...input.candidates
      .filter((c) => !suggested.has(c.term))
      .map((c) => [c.term, '', '', String(c.count), `${c.kind}: ${c.example}`]),
  ];
  return [TERM_FILE_HEADER, ...rows].map((r) => r.map(clean).join('\t')).join('\n') + '\n';
}

/** 용어 파일을 읽는다. 일반 표현을 채운 줄만 고르고, 정규식 용어는 여기서 컴파일해 본다. */
export function parseTermFile(text: string): DomainTermInput[] {
  const [header, ...lines] = text.split(/\r?\n/);
  if (header?.split('\t')[0] !== 'term') throw new Error('용어 파일 첫 줄이 머리줄(term\\treplacement\\t...)이 아니다');
  const terms = lines.flatMap((line, i) => {
    const [term = '', replacement = '', pattern = ''] = line.split('\t').map((c) => c.trim());
    if (!term || !replacement) return [];
    const isPattern = pattern.toLowerCase() === 'y';
    if (isPattern) {
      try {
        new RegExp(term);
      } catch {
        throw new Error(`${i + 2}번째 줄: 정규식이 아니다: ${term}`);
      }
    }
    return [{ term, replacement, isPattern }];
  });
  const duplicate = terms.find((t, i) => terms.findIndex((u) => u.term === t.term) !== i);
  if (duplicate) throw new Error(`같은 용어가 두 번 있다: ${duplicate.term}`);
  return terms;
}
