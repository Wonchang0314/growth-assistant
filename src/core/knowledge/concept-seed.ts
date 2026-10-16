import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { normalizeTerm } from './concept.js';

/** 트랙별 시드 YAML (`seed/<트랙>.yaml`, 형식은 cs.yaml 머리말). 빌드할 때 dist로 함께 복사한다 (nest-cli.json). */
export const SEED_DIR = join(import.meta.dirname, 'seed');

const names = z.array(z.string().trim().min(1)).default([]);

const seedFileSchema = z.object({
  track: z.object({
    key: z.string().regex(/^[a-z]+$/, '트랙 키는 영문 소문자'),
    name: z.string().trim().min(1),
    weight: z.number().min(0).max(1),
    description: z.string().trim().min(1),
  }),
  concepts: z.array(
    z.object({
      name: z.string().trim().min(1),
      parent: z.string().trim().min(1).optional(),
      // 숫자로 읽히는 별칭(401, 0600)은 YAML에서 따옴표로 묶어야 한다. 그대로 두면 0600이 600이 된다.
      aliases: names,
      description: z.string().trim().min(1),
      requires: names,
      related: names,
    }),
  ),
});

export type SeedFile = z.output<typeof seedFileSchema>;
export type SeedTrack = SeedFile['track'];
export type SeedConcept = SeedFile['concepts'][number] & { readonly track: string };

export interface ConceptSeed {
  readonly tracks: readonly SeedTrack[];
  readonly concepts: readonly SeedConcept[];
}

/** 시드 디렉터리의 YAML을 모두 읽어 검증한다. 형식이 틀리거나 [validateSeed]가 문제를 찾으면 전부 모아 던진다. */
export function loadSeed(dir: string = SEED_DIR): ConceptSeed {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  const parsed = files.map((file) => {
    const result = seedFileSchema.safeParse(parse(readFileSync(join(dir, file), 'utf8')));
    if (!result.success) throw new Error(`시드 파일 형식 오류 (${file}): ${z.prettifyError(result.error)}`);
    return result.data;
  });
  const seed: ConceptSeed = {
    tracks: parsed.map((f) => f.track),
    concepts: parsed.flatMap((f) => f.concepts.map((c) => ({ ...c, track: f.track.key }))),
  };
  const problems = validateSeed(seed);
  if (problems.length > 0) throw new Error(`시드 검증 실패:\n- ${problems.join('\n- ')}`);
  return seed;
}

/**
 * 시드의 일관성 문제를 모두 찾는다. 빈 배열이면 적재해도 된다.
 * 트랙 키·개념 이름 중복, 이름·별칭이 다른 개념과 겹침, 없는 개념 참조, 다른 트랙의 상위 개념,
 * 자기 참조, 상위 관계·선수 관계의 순환을 본다.
 */
export function validateSeed(seed: ConceptSeed): string[] {
  const problems: string[] = [];

  const trackKeys = new Set<string>();
  for (const t of seed.tracks) {
    if (trackKeys.has(t.key)) problems.push(`트랙 키 중복: ${t.key}`);
    trackKeys.add(t.key);
  }

  const byName = new Map<string, SeedConcept>();
  for (const c of seed.concepts) {
    if (byName.has(c.name)) problems.push(`개념 이름 중복: ${c.name}`);
    byName.set(c.name, c);
    if (!trackKeys.has(c.track)) problems.push(`없는 트랙: ${c.name} → ${c.track}`);
  }

  const termOwner = new Map<string, string>();
  for (const c of seed.concepts) {
    for (const term of [c.name, ...c.aliases]) {
      const key = normalizeTerm(term);
      const owner = termOwner.get(key);
      if (owner !== undefined && owner !== c.name) problems.push(`이름·별칭 겹침: "${term}" (${owner}, ${c.name})`);
      else termOwner.set(key, c.name);
    }
  }

  for (const c of seed.concepts) {
    if (c.parent !== undefined) {
      const parent = byName.get(c.parent);
      if (!parent) problems.push(`없는 상위 개념: ${c.name} → ${c.parent}`);
      else if (parent.track !== c.track) problems.push(`다른 트랙의 상위 개념: ${c.name} → ${c.parent}`);
    }
    for (const ref of [...c.requires, ...c.related]) {
      if (!byName.has(ref)) problems.push(`없는 개념 참조: ${c.name} → ${ref}`);
      if (ref === c.name) problems.push(`자기 참조: ${c.name}`);
    }
  }

  problems.push(...findCycles(seed.concepts, 'PART_OF', (c) => (c.parent === undefined ? [] : [c.parent])));
  problems.push(...findCycles(seed.concepts, 'PREREQUISITE', (c) => c.requires));
  return problems;
}

function findCycles(
  concepts: readonly SeedConcept[],
  kind: string,
  next: (c: SeedConcept) => readonly string[],
): string[] {
  const byName = new Map(concepts.map((c) => [c.name, c]));
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[] = [];
  const visit = (name: string, path: readonly string[]) => {
    const s = state.get(name);
    if (s === 'done') return;
    if (s === 'visiting') {
      cycles.push(`${kind} 순환: ${[...path.slice(path.indexOf(name)), name].join(' → ')}`);
      return;
    }
    state.set(name, 'visiting');
    const concept = byName.get(name);
    if (concept) for (const n of next(concept)) visit(n, [...path, name]);
    state.set(name, 'done');
  };
  for (const c of concepts) visit(c.name, []);
  return cycles;
}
