import { DiscoveryService } from '@nestjs/core';
import type { z } from 'zod';

/*
 * 기능 모듈의 MCP 입력 어댑터가 구현하고, `@McpTool()`을 붙여 provider로 등록한다 (ADR-0015).
 * McpServerHost가 모아서 MCP 서버에 등록한다. 처리기는 MCP SDK 타입과 전송 방식(stdio·HTTP)을 모른다.
 */

export interface McpToolHandler<Input extends z.ZodObject = z.ZodObject> {
  /** 동사로 시작하는 snake_case 이름. 처리기마다 달라야 한다. */
  readonly name: string;
  /** Claude가 도구를 고르는 근거. 무엇을 하는지와 언제 부르는지를 쓴다. */
  readonly description: string;
  /** 입력 스키마. SDK가 이 스키마로 검증한 값만 [handle]에 넘긴다. */
  readonly inputSchema: Input;
  /** DB를 바꾸지 않는 도구인지. Claude 앱이 호출 승인을 물을지 정하는 힌트다. */
  readonly readOnly: boolean;
  handle(input: z.output<Input>): Promise<McpToolResult>;
}

export interface McpToolResult {
  /** Claude가 읽을 짧은 요약. */
  readonly text: string;
  /** 요약과 함께 넘길 구조화된 내용. */
  readonly data?: Record<string, unknown>;
}

/** [McpToolHandler] 구현 클래스에 붙인다. */
export const McpTool = DiscoveryService.createDecorator<undefined>();

export function isMcpToolHandler(value: unknown): value is McpToolHandler {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'handle' in value &&
    typeof value.handle === 'function'
  );
}
