import { Injectable } from '@nestjs/common';
import type { Tx } from '../db/db.module.js';

/**
 * 개념 병합 때 함께 옮겨야 하는 다른 기능의 데이터(학습 기록, 복습 일정 등). `core`는 `tutor` 테이블을 모르므로
 * 그 기능이 이 포트를 구현해 [ConceptMergeParticipants]에 등록한다 (설계 문서 5.3 "개념 병합").
 */
export interface ConceptMergeParticipant {
  /** 병합 트랜잭션 [tx] 안에서 [sourceId]에 붙은 데이터를 [targetId]로 옮긴다. 이 뒤에 [sourceId] 개념이 지워진다. */
  moveConcept(tx: Tx, sourceId: number, targetId: number): Promise<void>;
}

/**
 * 병합 참여자 목록. 참여 모듈이 시작할 때(`onModuleInit`) 등록한다.
 * 참여자를 등록하지 않은 진입점(수집 CLI 등)에서 병합하면 그 데이터의 외래 키가 병합을 막는다.
 */
@Injectable()
export class ConceptMergeParticipants {
  private readonly participants: ConceptMergeParticipant[] = [];

  register(participant: ConceptMergeParticipant): void {
    this.participants.push(participant);
  }

  async moveConcept(tx: Tx, sourceId: number, targetId: number): Promise<void> {
    for (const p of this.participants) await p.moveConcept(tx, sourceId, targetId);
  }
}
