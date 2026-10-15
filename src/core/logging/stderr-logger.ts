import { ConsoleLogger, type LogLevel } from '@nestjs/common';

/**
 * MCP stdio 진입점에서 LOG_DIR가 없을 때 쓰는 로거. 모든 기록을 표준에러에 쓴다.
 * 표준출력은 MCP 메시지 통로라서 로그 한 줄만 섞여도 Claude Desktop이 메시지를 해석하지 못한다.
 */
export class StderrLogger extends ConsoleLogger {
  constructor() {
    super({ colors: false });
  }

  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    _writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    params?: Record<string, unknown>,
  ): void {
    super.printMessages(messages, context, logLevel, 'stderr', errorStack, params);
  }
}
