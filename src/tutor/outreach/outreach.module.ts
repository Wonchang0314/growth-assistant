import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../core/config/env.js';
import { IngestionModule } from '../../core/ingestion/ingestion.module.js';
import { ntfyTopicUrl } from '../../core/logging/ntfy.js';
import { SettingModule } from '../../core/setting/setting.module.js';
import { QuizModule } from '../quiz/quiz.module.js';
import { NightlyPrepJob } from './nightly-prep.job.js';
import { EveningAlertJob, MorningAlertJob } from './study-alert.job.js';
import { LoggingStudyNotifier, NtfyStudyNotifier, StudyNotifier } from './study-notifier.js';

/**
 * 서버가 먼저 하는 일: 새벽 준비(동기화·추출·오늘 계획의 문제 미리 만들기)와 학습 알림 (ADR-0036·0040).
 * 작업은 `@ScheduledJob()`으로 두고, 스케줄러를 켠 상시 실행 HTTP 진입점의 루트 모듈만 이 모듈을 import한다.
 */
@Module({
  imports: [IngestionModule, QuizModule, SettingModule],
  providers: [
    {
      provide: StudyNotifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const topicUrl = ntfyTopicUrl(config);
        return topicUrl ? new NtfyStudyNotifier(topicUrl) : new LoggingStudyNotifier();
      },
    },
    NightlyPrepJob,
    MorningAlertJob,
    EveningAlertJob,
  ],
})
export class OutreachModule {}
