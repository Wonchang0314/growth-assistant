import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { ExperienceRepository } from '../../core/memory/experience.repository.js';
import { SourceDocumentRepository } from '../../core/memory/source-document.repository.js';
import { AppSettingRepository } from '../../core/setting/app-setting.repository.js';
import { MasteryRepository } from '../mastery/mastery.repository.js';
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
const studyNotes = new StudyNoteService(
  new StudyNoteRepository(testDb.db),
  experiences,
  concepts,
  new MasteryService(new MasteryRepository(testDb.db)),
  clock,
);
const guideline = new QuizGuidelineService(new AppSettingRepository(testDb.db));
const repository = new DrizzleQuizQuestionRepository(testDb.db);
let claude: FakeClaudeClient;
let service: QuizGenerationService;

const multipleChoice = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    angle: 'WHY',
    keyPoint: '선택도가 낮으면 인덱스가 도움이 안 된다',
    difficulty: 2,
    prompt: '성별 컬럼에 인덱스를 걸어도 조회가 빨라지지 않는 이유는?',
    choices: [
      { text: '선택도가 낮아서', misconception: null },
      { text: '컬럼이 짧아서', misconception: '짧은 컬럼은 인덱스가 안 된다고 믿음' },
      { text: 'NULL이 많아서', misconception: 'NULL은 인덱스에 안 들어간다고 믿음' },
      { text: '정렬이 안 돼서', misconception: '문자열은 정렬되지 않는다고 믿음' },
    ],
    answer: '선택도가 낮아서',
    explanation: '해설',
    referenceMaterial: '근거',
    experienceId: 1,
    ...overrides,
  });
const fillBlank = JSON.stringify({
  angle: 'MECHANISM',
  keyPoint: '선택도',
  difficulty: 1,
  prompt: '인덱스가 효과 있으려면 ____가 높아야 한다',
  answer: '선택도',
  acceptedAnswers: ['selectivity'],
  explanation: '해설',
  referenceMaterial: '근거',
  experienceId: null,
});
const solved = (answer: Record<string, unknown>) => JSON.stringify({ singleAnswer: true, problems: [], ...answer });

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
    studyNotes,
    guideline,
    clock,
    () => 0,
  );
});
afterAll(() => testDb.close());

describe('QuizGenerationService', () => {
  it('헷갈린 점·경험 카드·출제 지침을 넣어 출제하고, 정답을 숨긴 풀이가 맞으면 VALID로 저장한다', async () => {
    await studyNotes.record({
      topic: '인덱스',
      summary: '요약',
      confusedPoints: ['인덱스를 걸면 항상 빨라진다고 생각했다'],
      answerRevealed: false,
      concepts: [{ name: '인덱스', signal: 'CONFUSED' }],
    });
    await guideline.edit({ add: ['보기에 코드 조각을 넣지 않는다'], remove: [] });
    claude.reply(multipleChoice()).reply(solved({ choice: 1 }));

    const result = await service.generate({ conceptId: 1, type: 'MULTIPLE_CHOICE' });

    expect(result).toMatchObject({ id: 1, status: 'VALID', problems: [] });
    const [generation] = claude.requestsFor('QUIZ_GENERATION');
    expect(generation?.prompt).toContain('인덱스를 걸면 항상 빨라진다고 생각했다');
    expect(generation?.prompt).toContain('### id 1: 성별 인덱스가 안 탐');
    expect(generation?.prompt).toContain('보기에 코드 조각을 넣지 않는다');
    // 검증 호출에는 정답 표시·오개념·해설이 가지 않는다.
    const [verification] = claude.requestsFor('QUIZ_VERIFICATION');
    expect(verification?.prompt).toContain('1. 선택도가 낮아서');
    expect(verification?.prompt).not.toMatch(/믿음|해설|근거/);
    expect(await testDb.db.select().from(quizQuestion)).toEqual([
      expect.objectContaining({
        conceptId: 1,
        type: 'MULTIPLE_CHOICE',
        answer: '선택도가 낮아서',
        experienceId: 1,
        validationStatus: 'VALID',
        validationNote: null,
      }),
    ]);
    expect(await repository.keyPoints(1)).toEqual(['선택도가 낮으면 인덱스가 도움이 안 된다']);
  });

  it('모양 검사에 걸리면 검증 없이 이유를 붙여 다시 쓰고, 주지 않은 카드 id는 버린다', async () => {
    claude
      .reply(multipleChoice({ answer: '컬럼이 짧아서' }))
      .reply(multipleChoice({ experienceId: 99 }))
      .reply(solved({ choice: 1 }));

    const result = await service.generate({ conceptId: 1, type: 'MULTIPLE_CHOICE' });

    expect(result.status).toBe('VALID');
    expect(result.question.experienceId).toBeNull();
    expect(claude.requestsFor('QUIZ_VERIFICATION')).toHaveLength(1);
    expect(claude.requestsFor('QUIZ_GENERATION')[1]?.prompt).toMatch(/## 지난 문제의 문제\n- 정답 보기/);
  });

  it('두 번 다 검증에 걸리면 걸린 이유와 함께 INVALID로 저장한다', async () => {
    claude
      .reply(fillBlank)
      .reply(solved({ answer: '카디널리티' }))
      .reply(fillBlank)
      .reply(solved({ answer: 'SELECTIVITY', singleAnswer: false }));

    const result = await service.generate({ conceptId: 1, type: 'FILL_BLANK' });

    expect(result).toMatchObject({ status: 'INVALID', problems: ['정답이 하나로 정해지지 않는다'] });
    expect(claude.requestsFor('QUIZ_GENERATION')[1]?.prompt).toContain('"카디널리티"라고 답했다');
    expect(await testDb.db.select().from(quizQuestion)).toEqual([
      expect.objectContaining({
        type: 'FILL_BLANK',
        choices: null,
        acceptedAnswers: ['selectivity'],
        validationStatus: 'INVALID',
        validationNote: '정답이 하나로 정해지지 않는다',
      }),
    ]);
    expect(await repository.keyPoints(1)).toEqual([]);
  });
});
