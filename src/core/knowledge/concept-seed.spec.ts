import { describe, expect, it } from 'vitest';
import { type ConceptSeed, loadSeed, type SeedConcept, validateSeed } from './concept-seed.js';

const tracks = [
  { key: 'cs', name: 'CS 기초', weight: 0.5, description: '원리' },
  { key: 'backend', name: '백엔드', weight: 0.5, description: '애플리케이션' },
];

function concept(name: string, overrides: Partial<SeedConcept> = {}): SeedConcept {
  return { name, track: 'cs', aliases: [], description: '설명', requires: [], related: [], ...overrides };
}

const seed = (...concepts: SeedConcept[]): ConceptSeed => ({ tracks, concepts });

describe('validateSeed', () => {
  it('문제가 없으면 빈 배열', () => {
    expect(
      validateSeed(
        seed(
          concept('인덱스 원리'),
          concept('B-tree 인덱스', { parent: '인덱스 원리' }),
          concept('복합 인덱스 설계', { track: 'backend', requires: ['B-tree 인덱스'] }),
        ),
      ),
    ).toEqual([]);
  });

  it('이름 중복과 다른 개념과 겹치는 별칭을 찾는다', () => {
    expect(validateSeed(seed(concept('A'), concept('A')))).toContain('개념 이름 중복: A');
    expect(validateSeed(seed(concept('A', { aliases: ['merge'] }), concept('B', { aliases: ['Merge'] })))).toEqual([
      '이름·별칭 겹침: "Merge" (A, B)',
    ]);
  });

  it('없는 개념 참조와 다른 트랙의 상위 개념을 찾는다', () => {
    expect(validateSeed(seed(concept('A', { requires: ['없음'] })))).toEqual(['없는 개념 참조: A → 없음']);
    expect(validateSeed(seed(concept('A'), concept('B', { track: 'backend', parent: 'A' })))).toEqual([
      '다른 트랙의 상위 개념: B → A',
    ]);
  });

  it('선수 관계와 상위 관계의 순환을 찾는다', () => {
    expect(
      validateSeed(
        seed(concept('A', { requires: ['B'] }), concept('B', { requires: ['C'] }), concept('C', { requires: ['A'] })),
      ),
    ).toEqual(['PREREQUISITE 순환: A → B → C → A']);
    expect(validateSeed(seed(concept('A', { parent: 'B' }), concept('B', { parent: 'A' })))).toEqual([
      'PART_OF 순환: A → B → A',
    ]);
  });
});

describe('loadSeed (src/core/knowledge/seed)', () => {
  it('저장소의 시드 파일은 검증을 통과한다', () => {
    const loaded = loadSeed();

    expect(loaded.tracks.map((t) => t.key).sort()).toEqual(['backend', 'cs', 'frontend', 'infra', 'interview']);
    expect(loaded.concepts.length).toBeGreaterThan(200);
    // 숫자로 읽히는 별칭이 문자열로 남아 있어야 한다 (0600이 600이 되지 않게).
    expect(loaded.concepts.flatMap((c) => c.aliases)).toContain('0600');
  });
});
