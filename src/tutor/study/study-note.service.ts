import { Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock/clock.js';
import type { RelatedConcept } from '../../core/knowledge/concept.js';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { ExperienceRepository, type FoundExperience } from '../../core/memory/experience.repository.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { mergeConceptLinks, searchTermsOf, type StudyNote, type StudySignal } from './study-note.js';

const RELATED_LIMIT = 5;
const RECENT_LIMIT = 3;
/** 학습 맥락에 싣는 경험 카드 수. 대화 맥락이 길어지지 않게 적게 둔다. */
const EXPERIENCE_LIMIT = 3;

export interface LearningContext {
  readonly topic: string;
  /** 주제와 관련 있는 개념(이름·별칭 매칭)과 그 상위·선수 개념. */
  readonly concepts: readonly RelatedConcept[];
  /** 관련 개념에 연결된 경험 카드. 맞은 개념이 많은 것부터. */
  readonly experiences: readonly FoundExperience[];
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

/**
 * 대화에서 쓰는 학습 맥락 조회, 경험 카드 검색, 학습 기록 (설계 문서 7.2). 학습 기록에서 다룬 개념은 복습 일정에 넣는다.
 * 숙련도는 3단계에서 맥락에 더한다.
 */
@Injectable()
export class StudyNoteService {
  constructor(
    private readonly repository: StudyNoteRepository,
    private readonly experiences: ExperienceRepository,
    private readonly concepts: ConceptService,
    private readonly mastery: MasteryService,
    private readonly clock: Clock,
  ) {}

  /**
   * 경험 카드를 개념(이름·별칭 매칭)과 글자로 찾는다. 개념으로 찾은 카드가 먼저다.
   * 거절된 개념(트랙 밖 분야 등)에만 연결된 카드도 글자로는 찾는다.
   */
  async searchExperiences(query: string, limit: number): Promise<FoundExperience[]> {
    const concepts = await this.concepts.relatedConcepts(query);
    const [byConcept, byText] = await Promise.all([
      this.experiences.findByConcepts(
        concepts.map((c) => c.id),
        limit,
      ),
      this.experiences.search(searchTermsOf(query), limit),
    ]);
    const unique = new Map([...byConcept, ...byText].map((e) => [e.id, e]));
    return [...unique.values()].slice(0, limit);
  }

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
    const now = this.clock.now();
    // 일정을 먼저 넣는다. 기록 저장이 실패해 다시 불려도 일정은 한 번만 생긴다.
    await this.mastery.introduce(
      links.map((l) => l.conceptId),
      now,
    );
    const note = await this.repository.add(
      {
        topic: input.topic.trim(),
        summary: input.summary.trim(),
        confusedPoints: input.confusedPoints.map((p) => p.trim()).filter((p) => p.length > 0),
        answerRevealed: input.answerRevealed,
        createdAt: now,
      },
      links,
    );
    return { note, linkedConcepts: [...new Set(resolved.map((r) => r.conceptName))], unknownConcepts: unknown };
  }

  async learningContext(topic: string): Promise<LearningContext> {
    const concepts = await this.concepts.relatedConcepts(topic);
    const conceptIds = concepts.map((c) => c.id);
    const [byText, byConcept, experiences] = await Promise.all([
      this.repository.search(searchTermsOf(topic), RELATED_LIMIT),
      this.repository.findByConcepts(conceptIds, RELATED_LIMIT),
      this.experiences.findByConcepts(conceptIds, EXPERIENCE_LIMIT),
    ]);
    const relatedNotes = newestFirst([...byText, ...byConcept]).slice(0, RELATED_LIMIT);
    const recentNotes = await this.repository.findRecent(
      RECENT_LIMIT,
      relatedNotes.map((n) => n.id),
    );
    return { topic, concepts, experiences, relatedNotes, recentNotes };
  }
}

/** 중복을 지우고 최근 것부터 정렬한다. */
function newestFirst(notes: readonly StudyNote[]): StudyNote[] {
  const unique = new Map(notes.map((n) => [n.id, n]));
  return [...unique.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
}
