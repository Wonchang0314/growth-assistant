# lean-code 예시

`SKILL.md` 규칙마다 이 레포에서 나올 법한 코드로 고치기 전과 후를 보인다.

## L1 타입은 원천에서

테이블 컬럼을 interface로 다시 적으면 컬럼을 바꿀 때 두 곳을 맞춰야 한다. 한쪽만 고쳐도 컴파일은 통과할 수 있다.

```ts
// 나쁨: concept 테이블 컬럼을 손으로 다시 적었다
export interface ConceptTerms {
  readonly id: number;
  readonly name: string;
  readonly aliases: readonly string[];
}

// 좋음: 테이블에서 끌어온다
export type Concept = typeof concept.$inferSelect;
export type ConceptTerms = Readonly<Pick<Concept, 'id' | 'name' | 'aliases'>>;
```

값 목록은 배열 하나가 타입, Drizzle enum, CHECK 제약을 모두 만든다. 이 레포가 이미 그렇게 하고 있다.

```ts
export const CONCEPT_STATUSES = ['ACTIVE', 'PROPOSED', 'REJECTED'] as const;
export type ConceptStatus = (typeof CONCEPT_STATUSES)[number];
// 스키마: varchar('status', { enum: CONCEPT_STATUSES }), check(... inList(CONCEPT_STATUSES))
```

외부 입력은 zod 스키마 하나에서 타입을 끌어온다(`env.ts`의 `Env = z.infer<typeof envSchema>`).

원천에 없는 필드가 있으면 새 타입을 둬도 된다. 여러 테이블을 조인해 만든 응답(`RelatedConcept`의 `parent`, `prerequisites`)이 그런 경우다.

## L2 두 번째에 합친다

`migrate.ts`와 `seed.ts`는 `.env` 읽기, 환경 변수 검증, `Pool` 생성을 똑같이 복사했다. 세 번째 진입점이 생기면 세 곳을 맞춰야 한다.

```ts
// 나쁨: 진입점마다 복사
try {
  process.loadEnvFile(process.env.GROWTH_ENV_FILE ?? '.env');
} catch {
  // .env가 없으면 실행 환경 변수와 기본값을 쓴다.
}
const env = validateEnv(process.env);
const pool = new Pool({ host: env.POSTGRES_HOST, port: env.POSTGRES_PORT /* ... */ });

// 좋음: 그 일이 속한 core/db에 하나만 두고 진입점은 부르기만 한다
const { env, pool } = openScriptPool();
```

합치지 않는 경우: `ClaudeCliClient`의 `callWithTimeoutRetry`와 `callOnce`는 인자 목록 `(request, jsonSchema, convert)`가 같지만, 하나는 재시도 정책이고 하나는 프로세스 실행이다. 바뀌는 이유가 다르면 모양이 같아도 중복이 아니다.

## L3 플랫폼이 하는 일은 맡긴다

```ts
// 나쁨: 직접 짠 그룹핑
const byTrack = new Map<string, Concept[]>();
for (const c of concepts) {
  const list = byTrack.get(c.track) ?? [];
  list.push(c);
  byTrack.set(c.track, list);
}

// 좋음
const byTrack = Map.groupBy(concepts, (c) => c.track);
```

```ts
// 나쁨: 파싱한 뒤 따로 변환
const raw = schema.parse(input);
const tags = raw.tags.split(',').map((t) => t.trim());

// 좋음: 변환도 스키마가 한다. 타입도 변환된 모양으로 추론된다
const schema = z.object({ tags: z.string().transform((s) => s.split(',').map((t) => t.trim())) });
```

## L4 기억할 것을 줄인다

```ts
// 나쁨: 줄은 적지만 분기 셋을 한 번에 들고 읽어야 한다
const label = due ? (overdue ? (days > 7 ? 'stale' : 'late') : 'due') : 'fresh';

// 좋음: 조기 반환. 한 줄에 조건 하나
function reviewLabel(due: boolean, overdue: boolean, days: number): ReviewLabel {
  if (!due) return 'fresh';
  if (!overdue) return 'due';
  return days > 7 ? 'stale' : 'late';
}
```

중간 변수는 이름이 뜻을 더할 때만 둔다. `const result = await repo.find(id); return result;`의 `result`는 아무것도 더하지 않는다.

## L5 테스트도 같다

```ts
// 나쁨: 입력만 다른 테스트를 복사
it('대소문자를 무시한다', () => expect(normalizeTerm('BTree')).toBe('btree'));
it('하이픈을 무시한다', () => expect(normalizeTerm('b-tree')).toBe('btree'));
it('공백을 무시한다', () => expect(normalizeTerm('b tree')).toBe('btree'));

// 좋음
it.each(['BTree', 'b-tree', 'b tree'])('%s를 btree로 정규화한다', (input) => {
  expect(normalizeTerm(input)).toBe('btree');
});
```

DB 테스트의 연결과 테이블 비우기는 이미 `test/db/test-db.ts`의 `connectTestDb()` 하나로 쓴다. 가짜 구현은 `test/fakes/`에 둔다. 단, 준비를 헬퍼로 숨기더라도 테스트가 검사하는 입력값은 테스트 본문에 보이게 둔다.
