import { Module } from '@nestjs/common';
import { MasteryRepository } from './mastery.repository.js';
import { MasteryService } from './mastery.service.js';

/** 개념별 FSRS 복습 일정과 숙련도·약점. 학습 기록과 퀴즈 채점이 갱신한다. */
@Module({
  providers: [MasteryRepository, MasteryService],
  exports: [MasteryService],
})
export class MasteryModule {}
