import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { inList } from '../../../core/db/sql.js';
import { concept } from '../../../core/knowledge/concept.schema.js';
import { decisionCase } from '../../../core/memory/decision-case.schema.js';
import { experience } from '../../../core/memory/experience.schema.js';
import { ANGLES, type Choice, QUESTION_TYPES, VALIDATION_STATUSES } from '../domain/quiz-question.js';

/**
 * 퀴즈 문제 (설계 문서 5.4). 객관식은 [choices]와 정답 보기의 글([answer]), 빈칸은 [answer]와 [acceptedAnswers]를 쓴다.
 * [validationNote]는 검증에 걸린 이유다(INVALID). 경험 카드·판단 사례가 지워지면 연결만 끊는다.
 */
export const quizQuestion = pgTable(
  'quiz_question',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    conceptId: bigint('concept_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id),
    type: varchar('type', { length: 16, enum: QUESTION_TYPES }).notNull(),
    angle: varchar('angle', { length: 16, enum: ANGLES }).notNull(),
    keyPoint: text('key_point').notNull(),
    variantOf: bigint('variant_of', { mode: 'number' }).references((): AnyPgColumn => quizQuestion.id),
    difficulty: smallint('difficulty').notNull(),
    prompt: text('prompt').notNull(),
    choices: jsonb('choices').$type<readonly Choice[]>(),
    answer: text('answer').notNull(),
    acceptedAnswers: text('accepted_answers')
      .array()
      .notNull()
      .default(sql`'{}'`),
    explanation: text('explanation').notNull(),
    referenceMaterial: text('reference_material').notNull(),
    experienceId: bigint('experience_id', { mode: 'number' }).references(() => experience.id, {
      onDelete: 'set null',
    }),
    caseId: bigint('case_id', { mode: 'number' }).references(() => decisionCase.id, { onDelete: 'set null' }),
    validationStatus: varchar('validation_status', { length: 16, enum: VALIDATION_STATUSES }).notNull(),
    validationNote: text('validation_note'),
    reported: boolean('reported').notNull().default(false),
    reportReason: text('report_reason'),
    usedCount: integer('used_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // 개념마다 출제할 수 있는 문제를 찾는다.
    index('idx_quiz_question_concept').on(t.conceptId, t.validationStatus),
    check('quiz_question_type_check', sql`${t.type} IN (${inList(QUESTION_TYPES)})`),
    check('quiz_question_angle_check', sql`${t.angle} IN (${inList(ANGLES)})`),
    check('quiz_question_validation_check', sql`${t.validationStatus} IN (${inList(VALIDATION_STATUSES)})`),
    check('quiz_question_difficulty_check', sql`${t.difficulty} BETWEEN 1 AND 3`),
    // 객관식만 보기가 있다.
    check('quiz_question_choices_check', sql`(${t.type} = 'MULTIPLE_CHOICE') = (${t.choices} IS NOT NULL)`),
  ],
);
