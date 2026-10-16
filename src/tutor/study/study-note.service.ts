import { Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock/clock.js';
import type { RelatedConcept } from '../../core/knowledge/concept.js';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { mergeConceptLinks, searchTermsOf, type StudyNote, type StudySignal } from './study-note.js';

const RELATED_LIMIT = 5;
const RECENT_LIMIT = 3;

export interface LearningContext {
  readonly topic: string;
  /** 주제와 관련 있는 개념(이름·별칭 매칭)과 그 상위·선수 개념. */
  readonly concepts: readonly RelatedConcept[];
  /** 주제와 겹치거나 관련 개념에 연결된 지난 학습 기록. 최근 것부터. */
  readonly relatedNotes: readonly StudyNote[];
  /** [relatedNotes]에 없는 최근 학습 기록. 지난번에 어디까지 했는지 이어 가는 데 쓴다. */
  readonly recentNotes: readonly StudyNote[];
}

export interface RecordedNote {
  readonly note: StudyNote;
  /** 연결한 개념의 정식 이름. */
  readonly linkedConcepts: readonly string[];
  /** 개념 목록에 없어 연결하지 않은 이름. */
  readonly unknownConcepts: readonly string[];
}

/** 대화에서 쓰는 학습 맥락 조회와 학습 기록 (설계 문서 7.2). 숙련도는 3단계, 경험 카드는 2단계 수집 뒤에 맥락에 더한다. */
@Injectable()
export class StudyNoteService {
  constructor(
    private readonly repository: StudyNoteRepository,
    private readonly concepts: ConceptService,
    private readonly clock: Clock,
  ) {}

  async record(input: {
    topic: string;
    summary: string;
    confusedPoints: readonly string[];
    answerRevealed: boolean;
    concepts: readonly { name: string; signal: StudySignal }[];
  }): Promise<RecordedNote> {
    const { resolved, unknown } = await this.concepts.resolve(input.concepts.map((c) => c.name));
    const signals = input.concepts.map((c, i) => ({ ...c, id: resolved.find((r) => r.index === i)?.id }));
    const links = mergeConceptLinks(
      signals.flatMap((s) => (s.id === undefined ? [] : [{ conceptId: s.id, signal: s.signal }])),
    );
    const note = await this.repository.add(
      {
        topic: input.topic.trim(),
        summary: input.summary.trim(),
        confusedPoints: input.confusedPoints.map((p) => p.trim()).filter((p) => p.length > 0),
        answerRevealed: input.answerRevealed,
        createdAt: this.clock.now(),
      },
      links,
    );
    return { note, linkedConcepts: [...new Set(resolved.map((r) => r.conceptName))], unknownConcepts: unknown };
  }

  async learningContext(topic: string): Promise<LearningContext> {
    const concepts = await this.concepts.relatedConcepts(topic);
    const [byText, byConcept] = await Promise.all([
      this.repository.search(searchTermsOf(topic), RELATED_LIMIT),
      this.repository.findByConcepts(
        concepts.map((c) => c.id),
        RELATED_LIMIT,
      ),
    ]);
    const relatedNotes = newestFirst([...byText, ...byConcept]).slice(0, RELATED_LIMIT);
    const recentNotes = await this.repository.findRecent(
      RECENT_LIMIT,
      relatedNotes.map((n) => n.id),
    );
    return { topic, concepts, relatedNotes, recentNotes };
  }
}

/** 중복을 지우고 최근 것부터 정렬한다. */
function newestFirst(notes: readonly StudyNote[]): StudyNote[] {
  const unique = new Map(notes.map((n) => [n.id, n]));
  return [...unique.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
}
