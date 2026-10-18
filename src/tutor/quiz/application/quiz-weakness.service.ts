import { Injectable } from '@nestjs/common';
import { Clock, localDate } from '../../../core/clock/clock.js';
import { ConceptService } from '../../../core/knowledge/concept.service.js';
import { type ConceptMastery, weaknessLevel } from '../../mastery/mastery.js';
import { MasteryService } from '../../mastery/mastery.service.js';
import { repeatedMisconceptions } from '../domain/grading.js';
import { type RootCause, rootCauses } from '../domain/root-cause.js';
import { QuizAttemptRepository } from './ports.js';

/** 트랙마다 보여 주는 약점 개념 수. */
const TOP_PER_TRACK = 3;
/** 근본 원인을 찾을 때 살펴보는 약점 개념 수와 선수 관계 깊이. */
const WEAK_SCAN_LIMIT = 30;
const PREREQUISITE_DEPTH = 3;

export interface WeakConcept {
  readonly name: string;
  readonly mastery: ConceptMastery;
  /** 두 번 이상 고른 오개념. */
  readonly repeatedMisconceptions: readonly string[];
}

export interface WeaknessReport {
  readonly tracks: readonly { readonly track: string; readonly concepts: readonly WeakConcept[] }[];
  readonly rootCauses: readonly RootCause[];
  /** 일정은 있지만 채점이 모자라 약점인지 모르는 개념 수. */
  readonly unmeasured: number;
}

/** 약점 보고 (설계 문서 8장 `get_weakness`). 지난주 대비 변화는 숙련도 이력이 생기는 4단계에서 더한다 (ADR-0031). */
@Injectable()
export class QuizWeaknessService {
  constructor(
    private readonly mastery: MasteryService,
    private readonly concepts: ConceptService,
    private readonly attempts: QuizAttemptRepository,
    private readonly clock: Clock,
  ) {}

  async report(): Promise<WeaknessReport> {
    const weak = await this.mastery.weakConcepts(WEAK_SCAN_LIMIT);
    const ids = weak.map((m) => m.conceptId);
    const [summaries, causes, unmeasured, attempts] = await Promise.all([
      this.concepts.summaries(ids),
      this.rootCausesOf(weak),
      this.mastery.countUnmeasured(),
      Promise.all(ids.map((id) => this.attempts.findForConcept(id))),
    ]);
    const byId = new Map(summaries.map((s) => [s.id, s]));
    const entries = weak.flatMap((m, i) => {
      const summary = byId.get(m.conceptId);
      if (!summary) return [];
      const concept = {
        name: summary.name,
        mastery: m,
        repeatedMisconceptions: repeatedMisconceptions(attempts[i] ?? []),
      };
      return [{ track: summary.track, concept }];
    });
    // 약점 점수 순서를 그대로 두고 트랙별로 나눈다.
    const tracks = [...Map.groupBy(entries, (e) => e.track)].map(([track, list]) => ({
      track,
      concepts: list.slice(0, TOP_PER_TRACK).map((e) => e.concept),
    }));
    return { tracks, rootCauses: causes, unmeasured };
  }

  /**
   * 복습할 개념을 고를 때 맨 앞에 두는 근본 원인 후보 (설계 문서 8장).
   * 오늘 이미 푼 개념은 뺀다. 미측정인 후보가 측정될 때까지 같은 날 계속 맨 앞에 나오지 않게 한다.
   */
  async rootCauseIds(limit: number): Promise<number[]> {
    const causes = await this.rootCausesOf(await this.mastery.weakConcepts(WEAK_SCAN_LIMIT));
    const reviewed = new Map(
      (await this.mastery.findMany(causes.map((c) => c.concept.id))).map((m) => [m.conceptId, m.lastReviewAt]),
    );
    const today = localDate(this.clock.now(), this.clock.timeZone);
    return causes
      .filter((c) => {
        const at = reviewed.get(c.concept.id);
        return !at || localDate(at, this.clock.timeZone) !== today;
      })
      .slice(0, limit)
      .map((c) => c.concept.id);
  }

  private async rootCausesOf(weak: readonly ConceptMastery[]): Promise<RootCause[]> {
    if (weak.length === 0) return [];
    const ids = weak.map((m) => m.conceptId);
    const [summaries, prerequisites] = await Promise.all([
      this.concepts.summaries(ids),
      this.concepts.prerequisites(ids, PREREQUISITE_DEPTH),
    ]);
    const prerequisiteIds = [...new Set([...prerequisites.values()].flat().map((c) => c.id))];
    const levels = new Map(
      (await this.mastery.findMany(prerequisiteIds)).map((m) => [m.conceptId, weaknessLevel(m)] as const),
    );
    return rootCauses({ weak: summaries, prerequisites, levels });
  }
}
