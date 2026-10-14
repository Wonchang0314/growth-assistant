import { join } from 'node:path';
import { inspect } from 'node:util';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import pinoRoll, { type RollStream } from 'pino-roll';

type JsonLogOptions = {
  context: string;
  logLevel: LogLevel;
  writeStreamType?: 'stdout' | 'stderr';
  errorStack?: unknown;
  params?: Record<string, unknown>;
  error?: Error;
};

/**
 * 운영(launchd)용 로거. 로그를 회전하는 파일에 한 줄씩 쓴다.
 * Nest ConsoleLogger의 JSON 모드는 모든 기록을 [printAsJson] 하나로 보내므로, 그 메서드만 바꿔 파일에 쓴다.
 */
export class FileLogger extends ConsoleLogger {
  constructor(private readonly stream: RollStream) {
    super({ json: true, colors: false });
  }

  /** `<dir>/growth-assistant.<날짜>.<번호>.log`. 하루 또는 10MB마다 새 파일, 최근 30개 보관. `current.log`가 현재 파일을 가리킨다. */
  static async create(dir: string): Promise<FileLogger> {
    const stream = await pinoRoll({
      file: join(dir, 'growth-assistant'),
      extension: '.log',
      dateFormat: 'yyyy-MM-dd',
      frequency: 'daily',
      size: '10m',
      limit: { count: 30 },
      symlink: true,
      mkdir: true,
    });
    return new FileLogger(stream);
  }

  /** 프로세스가 끝나기 직전(`exit` 이벤트)에 남은 기록을 쓴다. 동기로만 쓸 수 있는 곳이다. */
  flush(): void {
    try {
      this.stream.flushSync();
    } catch {
      // 파일이 아직 열리는 중이면 동기로는 쓸 수 없다. 시작 실패처럼 곧바로 끝나는 경우는 [close]를 기다린다.
    }
  }

  /** 남은 기록을 모두 쓰고 파일을 닫는다. 파일이 열리기 전이어도 열린 뒤에 쓰고 닫는다. */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.stream.once('close', resolve);
      this.stream.end();
    });
  }

  protected override printAsJson(message: unknown, options: JsonLogOptions): void {
    const log = this.getJsonLogObject(message, options);
    const context = log.context ? ` [${log.context}]` : '';
    const text = typeof log.message === 'string' ? log.message : inspect(log.message);
    const params = log.params ? ` ${inspect(log.params)}` : '';
    const error = log.error ? `\n${describeError(log.error)}` : '';
    const stack = typeof log.stack === 'string' ? `\n${log.stack}` : '';
    const level = log.level.toUpperCase().padEnd(7);
    this.stream.write(
      `${localTimestamp(new Date(log.timestamp))} ${level}${context} ${text}${params}${error}${stack}\n`,
    );
  }
}

function describeError(error: Record<string, unknown>): string {
  if (typeof error.stack === 'string') return error.stack;
  return `${String(error.name)}: ${String(error.message)}`;
}

/** 봇을 실행하는 기기의 시간대로 `2026-10-14 15:30:00.123`. */
function localTimestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}
