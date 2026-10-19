import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpServerHost } from './mcp-server.host.js';
import { McpTool, type McpToolHandler } from './mcp-tool.js';
import { McpModule } from './mcp.module.js';

const echoInput = z.object({ word: z.string().min(1).describe('되돌려 줄 단어') });

@McpTool()
@Injectable()
class EchoTool implements McpToolHandler<typeof echoInput> {
  readonly name: string = 'echo_word';
  readonly description = '단어를 그대로 돌려준다';
  readonly inputSchema = echoInput;
  readonly readOnly = true;

  handle({ word }: z.output<typeof echoInput>) {
    if (word === '실패') return Promise.reject(new Error('DB가 꺼져 있다'));
    if (word === '쿼리') {
      const cause = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      return Promise.reject(new Error('Failed query: select 1', { cause }));
    }
    return Promise.resolve({ text: `받은 단어: ${word}`, data: { word } });
  }
}

@McpTool()
@Injectable()
class DuplicateEchoTool extends EchoTool {}

@McpTool()
@Injectable()
class EchoCardTool extends EchoTool {
  override readonly name = 'echo_card';
  readonly view = { uri: 'ui://test/echo.html', name: '단어 카드', html: '<p>카드</p>' } as const;
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function connect(tools: (typeof EchoTool)[], instructions?: string) {
  const app = await Test.createTestingModule({
    imports: [McpModule.forRoot({ name: 'test', version: '0.0.0', instructions })],
    providers: tools,
  }).compile();
  await app.init();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await app.get(McpServerHost).connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  closers.push(async () => {
    await client.close();
    await app.close();
  });
  return client;
}

describe('McpServerHost', () => {
  it('@McpTool() 처리기를 찾아 입력 스키마·주석과 함께 등록한다', async () => {
    const client = await connect([EchoTool]);

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'echo_word',
      description: '단어를 그대로 돌려준다',
      inputSchema: { type: 'object', properties: { word: { type: 'string', description: '되돌려 줄 단어' } } },
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
  });

  it('연결할 때 사용 지침을 클라이언트에 전달한다', async () => {
    const client = await connect([EchoTool], '학습 대화에서만 도구를 부른다');

    expect(client.getInstructions()).toBe('학습 대화에서만 도구를 부른다');
  });

  it('결과를 요약 텍스트, JSON 텍스트, 구조화된 내용으로 돌려준다', async () => {
    const client = await connect([EchoTool]);

    const result = await client.callTool({ name: 'echo_word', arguments: { word: '인덱스' } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: 'text', text: '받은 단어: 인덱스' },
      { type: 'text', text: '{"word":"인덱스"}' },
    ]);
    expect(result.structuredContent).toEqual({ word: '인덱스' });
  });

  it('처리기 예외는 도구 오류 결과가 되고 서버는 계속 동작한다', async () => {
    const client = await connect([EchoTool]);

    const failed = await client.callTool({ name: 'echo_word', arguments: { word: '실패' } });
    const next = await client.callTool({ name: 'echo_word', arguments: { word: '다음' } });

    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual([{ type: 'text', text: 'echo_word 실패: DB가 꺼져 있다' }]);
    expect(next.isError).toBeFalsy();
  });

  // Drizzle은 "Failed query: ..." 오류의 cause에 DB 연결 실패 같은 실제 원인을 둔다.
  it('도구 오류에 예외의 원인(cause)까지 담는다', async () => {
    const client = await connect([EchoTool]);

    const failed = await client.callTool({ name: 'echo_word', arguments: { word: '쿼리' } });

    expect(failed.content).toEqual([
      { type: 'text', text: 'echo_word 실패: Failed query: select 1 (원인: connect ECONNREFUSED 127.0.0.1:5432)' },
    ]);
  });

  it('스키마에 맞지 않는 입력은 처리기에 닿기 전에 오류가 된다', async () => {
    const client = await connect([EchoTool]);

    const result = await client.callTool({ name: 'echo_word', arguments: { word: '' } });

    expect(result.isError).toBe(true);
  });

  it('화면(view)이 있는 도구는 MCP Apps 메타데이터와 함께 등록하고, 그 HTML을 ui:// 리소스로 내보낸다', async () => {
    const client = await connect([EchoTool, EchoCardTool]);

    const { tools } = await client.listTools();
    const resource = await client.readResource({ uri: 'ui://test/echo.html' });

    expect(tools.find((t) => t.name === 'echo_card')?._meta).toMatchObject({
      ui: { resourceUri: 'ui://test/echo.html' },
    });
    expect(tools.find((t) => t.name === 'echo_word')?._meta).toBeUndefined();
    expect(resource.contents).toEqual([
      { uri: 'ui://test/echo.html', mimeType: 'text/html;profile=mcp-app', text: '<p>카드</p>' },
    ]);
  });

  it('도구 이름이 겹치면 뜨지 않는다', async () => {
    await expect(connect([EchoTool, DuplicateEchoTool])).rejects.toThrow('MCP 도구 이름이 겹친다: echo_word');
  });
});
