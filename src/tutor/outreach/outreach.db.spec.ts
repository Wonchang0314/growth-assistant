import { Module } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FakeDocumentSource } from '../../../test/fakes/fake-document-source.js';
import { FakeStudyNotifier } from '../../../test/fakes/fake-study-notifier.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { multipleChoiceReply, solvedReply } from '../../../test/fixtures/quiz.js';
import { compileMcpRoot } from '../../../test/mcp-app.js';
import { DocumentSource } from '../../core/ingestion/document-source.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { ClaudeClient } from '../../core/llm/claude.client.js';
import { AppSettingRepository } from '../../core/setting/app-setting.repository.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { QuizQuestionRepository } from '../quiz/application/ports.js';
import { RANDOM } from '../quiz/application/quiz-generation.service.js';
import { QuizGradingService } from '../quiz/application/quiz-grading.service.js';
import { NightlyPrepJob } from './nightly-prep.job.js';
import { ALERT_SETTINGS, EveningAlertJob, MorningAlertJob } from './study-alert.job.js';
import { StudyNotifier } from './study-notifier.js';

const testDb = connectTestDb();
const DAY = 24 * 60 * 60 * 1000;
const clock = new FixedClock(new Date('2026-10-20T21:00:00+09:00'));
const notifier = new FakeStudyNotifier();
const source = new FakeDocumentSource();
const claude = new FakeClaudeClient();
let app: TestingModule;

beforeAll(async () => {
  app = await compileMcpRoot(
    clock,
    async () => {
      const { AppConfigModule } = await import('../../core/config/app-config.module.js');
      const { ClockModule } = await import('../../core/clock/clock.module.js');
      const { DbModule } = await import('../../core/db/db.module.js');
      const { OutreachModule } = await import('./outreach.module.js');
      @Module({ imports: [AppConfigModule, ClockModule, DbModule.forRoot({ migrate: false }), OutreachModule] })
      class OutreachTestModule {}
      return OutreachTestModule;
    },
    (builder) =>
      builder
        .overrideProvider(StudyNotifier)
        .useValue(notifier)
        .overrideProvider(DocumentSource)
        .useValue(source)
        .overrideProvider(ClaudeClient)
        .useValue(claude)
        // 보기를 섞지 않아 정답이 1번에 남는다(가짜 풀이 응답이 1번을 고른다).
        .overrideProvider(RANDOM)
        .useValue(() => 0),
  );
  await app.init();
});
beforeEach(async () => {
  await testDb.truncateAll();
  notifier.alerts.length = 0;
  source.listError = undefined;
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
      concepts: [{ name: '인덱스', track: 'database', aliases: [], description: '인덱스', requires: [], related: [] }],
    },
    clock.now(),
  );
});
afterAll(async () => {
  await app.close();
  await testDb.close();
  vi.unstubAllEnvs();
});

/** 개념 1을 오늘 복습할 때가 되게 한다. */
const dueToday = () => app.get(MasteryService).introduce([1], clock.now());

/** 개념 1의 문제를 하나 오늘 푼다. */
async function answerToday() {
  const questionId = await app.get(QuizQuestionRepository).add({
    conceptId: 1,
    type: 'MULTIPLE_CHOICE',
    angle: 'WHY',
    keyPoint: '핵심',
    difficulty: 1,
    prompt: '질문',
    choices: [
      { text: '맞는 보기', misconception: null },
      { text: '틀린 보기', misconception: '오개념' },
    ],
    answer: '맞는 보기',
    explanation: '해설',
    referenceMaterial: '근거',
    experienceId: null,
    variantOf: null,
    caseId: null,
    validationStatus: 'VALID',
    validationNote: null,
    createdAt: clock.now(),
  });
  await app.get(QuizGradingService).submit({ questionId, answer: '1', confidence: 'SURE', hintUsed: false });
}

describe('아침 알림', () => {
  it('기본은 꺼져 있어 복습할 개념이 있어도 보내지 않는다', async () => {
    await dueToday();

    expect(await app.get(MorningAlertJob).run()).toBe('꺼져 있어 보내지 않음');
    expect(notifier.alerts).toEqual([]);
  });

  it('설정으로 켜면 오늘 복습할 개념 수를 보낸다', async () => {
    await dueToday();
    await app.get(AppSettingRepository).set(ALERT_SETTINGS.morning, 'on');

    await app.get(MorningAlertJob).run();

    expect(notifier.alerts).toEqual([
      { title: '오늘 복습 1개', body: 'Claude 앱에서 "복습하자"라고 말하면 시작한다.' },
    ]);
  });
});

describe('저녁 알림', () => {
  it('오늘 푼 문제가 없고 복습할 개념이 있으면 개수만 담아 보낸다', async () => {
    await dueToday();

    await app.get(EveningAlertJob).run();

    expect(notifier.alerts).toHaveLength(1);
    expect(notifier.alerts[0]?.body).toContain('복습할 개념 1개');
    expect(notifier.alerts[0]?.body).not.toContain('인덱스');
  });

  it.each([
    ['오늘 한 문제라도 풀었으면', () => dueToday().then(answerToday), '오늘 1문제를 풀어 보내지 않음'],
    ['복습할 개념이 없으면', () => Promise.resolve(), '복습할 개념이 없어 보내지 않음'],
    [
      '설정으로 껐으면',
      () => dueToday().then(() => app.get(AppSettingRepository).set(ALERT_SETTINGS.evening, 'off')),
      '꺼져 있어 보내지 않음',
    ],
  ])('%s 보내지 않는다', async (_, arrange, result) => {
    await arrange();

    expect(await app.get(EveningAlertJob).run()).toBe(result);
    expect(notifier.alerts).toEqual([]);
  });

  // 시계는 화요일(2026-10-20) 21:00(Asia/Seoul)이다.
  it.each([
    ['토요일', 4],
    ['일요일', 5],
  ])('%s에는 복습할 개념이 있어도 보내지 않는다', async (_, days) => {
    clock.advance(days * DAY);
    try {
      await dueToday();

      expect(await app.get(EveningAlertJob).run()).toBe('주말이라 보내지 않음');
      expect(notifier.alerts).toEqual([]);
    } finally {
      clock.advance(-days * DAY);
    }
  });
});

describe('새벽 작업', () => {
  it('동기화가 실패해도 뒤 단계를 하고 오늘 복습할 개념의 문제를 미리 만든 뒤, 실패로 끝낸다', async () => {
    await dueToday();
    source.listError = new Error('Notion 응답 없음');
    claude.reply(multipleChoiceReply()).reply(solvedReply({ choice: 1 }));

    const run = app.get(NightlyPrepJob).run();

    await expect(run).rejects.toThrow(
      '동기화 실패: Notion 응답 없음 / 추출: 문서 0개, 카드 0장, 실패 0 / ' +
        '판단 사례: 선별 0장, 경험 0·가정 0·PENDING 0, 실패 0 / 문제 만들기: 문제가 없는 개념 1개 중 1개 만듦',
    );
    expect(await app.get(QuizQuestionRepository).findServable(1, 1)).toHaveLength(1);
  });
});
