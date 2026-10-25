import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { fillBlankReply, guessReply, multipleChoiceReply } from '../../../test/fixtures/quiz.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { ExperienceRepository } from '../../core/memory/experience.repository.js';
import { SourceDocumentRepository } from '../../core/memory/source-document.repository.js';
import { AppSettingRepository } from '../../core/setting/app-setting.repository.js';
import { MasteryRepository } from '../mastery/mastery.repository.js';
import { newMastery } from '../mastery/mastery.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { StudyNoteRepository } from '../study/study-note.repository.js';
import { StudyNoteService } from '../study/study-note.service.js';
import { QuizGenerationService } from './application/quiz-generation.service.js';
import { QuizGuidelineService } from './application/quiz-guideline.service.js';
import { ClaudeQuestionGenerator } from './infrastructure/claude-question.generator.js';
import { DrizzleQuizQuestionRepository } from './infrastructure/drizzle-quiz-question.repository.js';
import { quizQuestion } from './infrastructure/quiz-question.schema.js';

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-18T09:00:00Z'));
const concepts = new ConceptService(new ConceptRepository(testDb.db));
const experiences = new ExperienceRepository(testDb.db);
const mastery = new MasteryService(new MasteryRepository(testDb.db));
const studyNotes = new StudyNoteService(new StudyNoteRepository(testDb.db), experiences, concepts, mastery, clock);
const guideline = new QuizGuidelineService(new AppSettingRepository(testDb.db));
const repository = new DrizzleQuizQuestionRepository(testDb.db);
let claude: FakeClaudeClient;
let service: QuizGenerationService;

const multipleChoice = multipleChoiceReply;
const fillBlank = fillBlankReply;
const guess = guessReply;

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
      concepts: [
        { name: '인덱스', track: 'database', aliases: [], description: '조회용 구조', requires: [], related: [] },
      ],
    },
    clock.now(),
  );
  const documents = new SourceDocumentRepository(testDb.db);
  await documents.save(
    'NOTION',
    { externalId: 'a', title: '문서', url: 'https://notion.so/a', updatedAt: clock.now(), chunks: ['본문'] },
    clock.now(),
  );
  await experiences.saveExtraction({
    documentId: 1,
    summary: '요약',
    cards: [
      {
        projectName: null,
        title: '성별 인덱스가 안 탐',
        situation: '느린 조회',
        task: '과제',
        action: '성별에 인덱스를 걸었다',
        result: '그대로 느렸다',
        lesson: '선택도를 먼저 본다',
        occurredAt: null,
        concepts: [1],
      },
    ],
    newConcepts: [],
    aliasAdds: [],
    now: clock.now(),
  });
  claude = new FakeClaudeClient();
  service = new QuizGenerationService(
    new ClaudeQuestionGenerator(claude),
    repository,
    concepts,
    experiences,
    mastery,
    studyNotes,
    guideline,
    clock,
    () => 0,
  );
});
afterAll(() => testDb.close());

describe('QuizGenerationService', () => {
  it('헷갈린 점·출제 지침을 넣어 출제하고, 보기만 보고 단서를 찾지 못하면 VALID로 저장한다', async () => {
    await studyNotes.record({
      topic: '인덱스',
      summary: '요약',
      confusedPoints: ['인덱스를 걸면 항상 빨라진다고 생각했다'],
      answerRevealed: false,
      concepts: [{ name: '인덱스', signal: 'CONFUSED' }],
    });
    await guideline.edit({ add: ['보기에 코드 조각을 넣지 않는다'], remove: [] });
    claude.reply(multipleChoice()).reply(guess());

    const result = await service.generate({ conceptId: 1, type: 'MULTIPLE_CHOICE' });

    expect(result).toMatchObject({ id: 1, status: 'VALID', problems: [] });
    const [generation] = claude.requestsFor('QUIZ_GENERATION');
    expect(generation?.prompt).toContain('인덱스를 걸면 항상 빨라진다고 생각했다');
    expect(generation?.prompt).toContain('보기에 코드 조각을 넣지 않는다');
    // 숙련도가 없는 개념은 동작 원리부터 묻고, 길이 상한을 싣는다.
    expect(generation?.prompt).toContain('## 각도\n동작 원리(MECHANISM)');
    expect(generation?.prompt).toContain('질문은 2문장, 150자 안으로 쓴다. 보기는 하나에 40자 안으로 쓴다.');
    // 경험 카드는 출제에 싣지 않는다. 문제에는 그 개념의 카드를 코드가 잇는다 (ADR-0038).
    expect(generation?.prompt).not.toMatch(/성별 인덱스가 안 탐|성별에 인덱스를 걸었다|선택도를 먼저 본다/);
    // 검증 호출에는 보기만 가고 질문·정답 표시·오개념·해설은 가지 않는다.
    const [verification] = claude.requestsFor('QUIZ_VERIFICATION');
    expect(verification?.prompt).toContain('1. 선택도가 낮아서');
    expect(verification?.prompt).not.toMatch(/성별 컬럼|믿음|해설|근거/);
    expect(await testDb.db.select().from(quizQuestion)).toEqual([
      expect.objectContaining({
        conceptId: 1,
        type: 'MULTIPLE_CHOICE',
        angle: 'MECHANISM',
        answer: '선택도가 낮아서',
        experienceId: 1,
        caseId: null,
        validationStatus: 'VALID',
        validationNote: null,
      }),
    ]);
    expect(await repository.keyPoints(1)).toEqual(['선택도가 낮으면 인덱스가 도움이 안 된다']);
  });

  it('모양·길이 검사에 걸리면 검증 없이 이유를 붙여 다시 쓴다', async () => {
    claude
      .reply(multipleChoice({ answer: '컬럼이 짧아서', prompt: `${'긴 사연. '.repeat(3)}왜 느린가?` }))
      .reply(multipleChoice())
      .reply(guess());

    const result = await service.generate({ conceptId: 1, type: 'MULTIPLE_CHOICE' });

    expect(result.status).toBe('VALID');
    expect(claude.requestsFor('QUIZ_VERIFICATION')).toHaveLength(1);
    expect(claude.requestsFor('QUIZ_GENERATION')[1]?.prompt).toMatch(
      /## 지난 문제의 문제\n- 정답 보기.*\n- 질문이 4문장이다/,
    );
  });

  it.each([
    ['양호하고 숙련도가 중간이면 왜', 0.6, 'WHY', '## 각도\n왜(WHY)'],
    ['숙련도가 높으면 트레이드오프', 0.9, 'TRADEOFF', '## 각도\n트레이드오프(TRADEOFF)'],
  ] as const)('%s를 묻는다', async (_, masteryScore, angle, section) => {
    const at = clock.now();
    await new MasteryRepository(testDb.db).save({
      ...newMastery(1, at),
      masteryScore,
      weaknessScore: 0.2,
      gradedAttempts: 3,
    });
    claude.reply(multipleChoice()).reply(guess());

    const result = await service.generate({ conceptId: 1, type: 'MULTIPLE_CHOICE' });

    expect(result.question.angle).toBe(angle);
    expect(claude.requestsFor('QUIZ_GENERATION')[0]?.prompt).toContain(section);
  });

  it('두 번 다 보기만 보고 정답을 골라내면 단서와 함께 INVALID로 저장한다', async () => {
    claude
      .reply(multipleChoice())
      .reply(guess({ cue: '1번만 이유가 짧다' }))
      .reply(multipleChoice())
      .reply(guess({ cue: '1번만 결론이 다르다' }));

    const result = await service.generate({ conceptId: 1, type: 'MULTIPLE_CHOICE' });

    const note = '질문 없이 보기만 보고 정답을 고를 수 있다: 1번만 결론이 다르다';
    expect(result).toMatchObject({ status: 'INVALID', problems: [note] });
    expect(claude.requestsFor('QUIZ_GENERATION')[1]?.prompt).toContain('1번만 이유가 짧다');
    expect(await testDb.db.select().from(quizQuestion)).toEqual([
      expect.objectContaining({ validationStatus: 'INVALID', validationNote: note }),
    ]);
    expect(await repository.keyPoints(1)).toEqual([]);
  });

  it('빈칸은 보기가 없어 모양 검사만 하고 VALID로 저장한다', async () => {
    claude.reply(fillBlank);

    const result = await service.generate({ conceptId: 1, type: 'FILL_BLANK' });

    expect(result.status).toBe('VALID');
    expect(claude.requestsFor('QUIZ_VERIFICATION')).toEqual([]);
    expect(await testDb.db.select().from(quizQuestion)).toEqual([
      expect.objectContaining({ type: 'FILL_BLANK', choices: null, acceptedAnswers: ['selectivity'] }),
    ]);
  });
});
