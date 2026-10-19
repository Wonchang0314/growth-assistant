import { inspect } from 'node:util';
import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';

/**
 * 외부 헬스체크가 부르는 `GET /healthz`. 프로세스가 답하고 DB에 쿼리가 닿으면 200, DB에 닿지 않으면 503이다.
 * 인증 없이 열어 두므로 상태 말고는 아무것도 돌려주지 않는다.
 */
@Controller('healthz')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (e) {
      this.logger.error('헬스체크: DB에 닿지 않는다', inspect(e));
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
