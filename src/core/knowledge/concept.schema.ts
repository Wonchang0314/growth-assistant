import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { CONCEPT_EDGE_TYPES, CONCEPT_ORIGINS, CONCEPT_STATUSES } from './concept.js';

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** 학습 트랙 (설계 문서 1장, ADR-0021). 가중치는 새 개념을 고를 때 쓴다. */
export const track = pgTable('track', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: varchar('key', { length: 32 }).notNull().unique(),
  name: text('name').notNull(),
  weight: real('weight').notNull(),
  description: text('description').notNull(),
});

/** 통제 어휘 개념 (설계 문서 5.1, 6장). 이름은 전체에서 유일하고, 다른 표기는 별칭에 둔다. */
export const concept = pgTable(
  'concept',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    trackId: integer('track_id')
      .notNull()
      .references(() => track.id),
    name: text('name').notNull().unique(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'`),
    description: text('description').notNull(),
    status: varchar('status', { length: 16, enum: CONCEPT_STATUSES }).notNull(),
    origin: varchar('origin', { length: 16, enum: CONCEPT_ORIGINS }).notNull(),
    autoApproved: boolean('auto_approved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('concept_status_check', sql`${t.status} IN (${inList(CONCEPT_STATUSES)})`),
    check('concept_origin_check', sql`${t.origin} IN (${inList(CONCEPT_ORIGINS)})`),
  ],
);

/** 개념 사이 관계. 방향의 뜻은 [ConceptEdgeType]을 따른다. 선수 체인은 재귀 CTE로 조회한다. */
export const conceptEdge = pgTable(
  'concept_edge',
  {
    fromId: bigint('from_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id, { onDelete: 'cascade' }),
    toId: bigint('to_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 16, enum: CONCEPT_EDGE_TYPES }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromId, t.toId, t.type] }),
    // 하위 개념처럼 반대 방향으로 찾을 때 쓴다.
    index('idx_concept_edge_to').on(t.toId, t.type),
    check('concept_edge_type_check', sql`${t.type} IN (${inList(CONCEPT_EDGE_TYPES)})`),
    check('concept_edge_not_self', sql`${t.fromId} <> ${t.toId}`),
  ],
);
