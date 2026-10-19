import { Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock/clock.js';
import { type DailyJob, ScheduledJob } from '../../core/scheduler/daily-job.js';
import { AppSettingRepository } from '../../core/setting/app-setting.repository.js';
import { QuizReviewService } from '../quiz/application/quiz-review.service.js';
import { StudyNotifier } from './study-notifier.js';

/** 학습 알림을 켜고 끄는 `app_setting` 키. 값은 `on`·`off`이고, 없으면 알림마다 정한 기본값을 쓴다. */
export const ALERT_SETTINGS = { morning: 'outreach.morning_alert', evening: 'outreach.evening_alert' } as const;

const HOW_TO_START = 'Claude 앱에서 "복습하자"라고 말하면 시작한다.';

async function enabled(settings: AppSettingRepository, key: string, fallback: boolean): Promise<boolean> {
  const value = await settings.get(key);
  return value === undefined ? fallback : value === 'on';
}

/** [timeZone]에서 [date]가 토요일·일요일인지. */
const isWeekend = (date: Date, timeZone: string) =>
  ['Sat', 'Sun'].includes(date.toLocaleDateString('en-US', { timeZone, weekday: 'short' }));

/**
 * 07:30 아침 알림 "오늘 복습 N개". 기본은 꺼져 있다. Cowork 예약 작업이 아침 복습을 준비하는 경로를 먼저 시험하고,
 * 그 경로가 안 되면 `outreach.morning_alert`를 `on`으로 켠다 (ADR-0036).
 */
@ScheduledJob()
@Injectable()
export class MorningAlertJob implements DailyJob {
  readonly name = 'morning-alert';
  readonly at = '07:30';

  constructor(
    private readonly review: QuizReviewService,
    private readonly settings: AppSettingRepository,
    private readonly notifier: StudyNotifier,
  ) {}

  async run(): Promise<string> {
    if (!(await enabled(this.settings, ALERT_SETTINGS.morning, false))) return '꺼져 있어 보내지 않음';
    const { conceptIds } = await this.review.today();
    if (conceptIds.length === 0) return '복습할 개념이 없어 보내지 않음';
    await this.notifier.notify({ title: `오늘 복습 ${conceptIds.length}개`, body: HOW_TO_START });
    return `보냄 (개념 ${conceptIds.length}개)`;
  }
}

/**
 * 21:00 저녁 알림. 평일([Clock.timeZone])에 그날 채점 기록이 없고 오늘 복습할 개념이 있을 때만 보낸다.
 * 기본은 켜져 있다(`outreach.evening_alert`). 주말 저녁은 쉬게 둔다(2026-10-20 사용자 결정).
 */
@ScheduledJob()
@Injectable()
export class EveningAlertJob implements DailyJob {
  readonly name = 'evening-alert';
  readonly at = '21:00';

  constructor(
    private readonly review: QuizReviewService,
    private readonly settings: AppSettingRepository,
    private readonly notifier: StudyNotifier,
    private readonly clock: Clock,
  ) {}

  async run(): Promise<string> {
    if (!(await enabled(this.settings, ALERT_SETTINGS.evening, true))) return '꺼져 있어 보내지 않음';
    if (isWeekend(this.clock.now(), this.clock.timeZone)) return '주말이라 보내지 않음';
    const { answered, conceptIds } = await this.review.today();
    if (answered > 0) return `오늘 ${answered}문제를 풀어 보내지 않음`;
    if (conceptIds.length === 0) return '복습할 개념이 없어 보내지 않음';
    await this.notifier.notify({
      title: '오늘 복습을 아직 하지 않았다',
      body: `복습할 개념 ${conceptIds.length}개가 남았다. ${HOW_TO_START}`,
    });
    return `보냄 (개념 ${conceptIds.length}개)`;
  }
}
