import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/** `GET /healthz`. HTTP 진입점의 루트 모듈(McpHttpAppModule)만 import한다. DB는 전역 DbModule에서 받는다. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
