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
  readonly name = 'echo_word';
  readonly description = '단어를 그대로 돌려준다';
  readonly inputSchema = echoInput;
  readonly readOnly = true;

  handle({ word }: z.output<typeof echoInput>) {
    if (word === '실패') return Promise.reject(new Error('DB가 꺼져 있다'));
    return Promise.resolve({ text: `받은 단어: ${word}`, data: { word } });
  }
}

@McpTool()
@Injectable()
class DuplicateEchoTool extends EchoTool {}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function connect(tools: (typeof EchoTool)[]) {
  const app = await Test.createTestingModule({
    imports: [McpModule.forRoot({ name: 'test', version: '0.0.0' })],
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

  it('스키마에 맞지 않는 입력은 처리기에 닿기 전에 오류가 된다', async () => {
    const client = await connect([EchoTool]);

    const result = await client.callTool({ name: 'echo_word', arguments: { word: '' } });

    expect(result.isError).toBe(true);
  });

  it('도구 이름이 겹치면 뜨지 않는다', async () => {
    await expect(connect([EchoTool, DuplicateEchoTool])).rejects.toThrow('MCP 도구 이름이 겹친다: echo_word');
  });
});
