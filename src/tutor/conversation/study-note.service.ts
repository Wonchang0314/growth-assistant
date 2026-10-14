import { Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock/clock.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { searchTermsOf, type StudyNote } from './study-note.js';

const RELATED_LIMIT = 5;
const RECENT_LIMIT = 3;

export interface LearningContext {
  readonly topic: string;
  /** 주제와 겹치는 지난 학습 기록. 최근 것부터. */
  readonly relatedNotes: readonly StudyNote[];
  /** [relatedNotes]에 없는 최근 학습 기록. 지난번에 어디까지 했는지 이어 가는 데 쓴다. */
  readonly recentNotes: readonly StudyNote[];
}

/** 대화에서 쓰는 학습 맥락 조회와 학습 기록 (설계 문서 7.2). 개념·숙련도·경험 카드는 2·3단계에서 맥락에 더한다. */
@Injectable()
export class StudyNoteService {
  constructor(
    private readonly repository: StudyNoteRepository,
    private readonly clock: Clock,
  ) {}

  async record(input: {
    topic: string;
    summary: string;
    confusedPoints: readonly string[];
    answerRevealed: boolean;
  }): Promise<StudyNote> {
    return this.repository.add({
      topic: input.topic.trim(),
      summary: input.summary.trim(),
      confusedPoints: input.confusedPoints.map((p) => p.trim()).filter((p) => p.length > 0),
      answerRevealed: input.answerRevealed,
      createdAt: this.clock.now(),
    });
  }

  async learningContext(topic: string): Promise<LearningContext> {
    const relatedNotes = await this.repository.search(searchTermsOf(topic), RELATED_LIMIT);
    const recentNotes = await this.repository.findRecent(
      RECENT_LIMIT,
      relatedNotes.map((n) => n.id),
    );
    return { topic, relatedNotes, recentNotes };
  }
}
