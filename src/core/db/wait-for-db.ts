import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';

/** 맥이 켜질 때 Docker Desktop과 PostgreSQL이 뜨는 데 1분 남짓 걸린다. */
const DB_WAIT = { attempts: 12, intervalMs: 5_000 };

/**
 * DB가 받을 때까지 [check]를 [intervalMs] 간격으로 [attempts]번까지 부른다. 끝내 실패하면 마지막 오류를 던진다.
 * 상시 실행 서버가 시작할 때 놓친 실행을 따라잡기 전에 부른다. 던지면 프로세스가 끝나고 launchd(`KeepAlive`)가 다시 띄운다.
 */
export async function waitForDb(check: () => Promise<unknown>, { attempts, intervalMs } = DB_WAIT): Promise<void> {
  const logger = new Logger('DbWait');
  for (let attempt = 1; ; attempt++) {
    try {
      await check();
      return;
    } catch (e) {
      if (attempt >= attempts) throw e;
      logger.warn(`DB에 닿지 않는다 (${attempt}/${attempts}), ${intervalMs}ms 뒤 다시: ${String(e)}`);
      await sleep(intervalMs);
    }
  }
}
