import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { McpServerHost } from './core/mcp/mcp-server.host.js';
import { runMcpEntry } from './mcp-entry.js';

/*
 * MCP stdio 진입점. Claude Desktop이 `node dist/mcp-stdio.js`로 띄우고 표준입력·표준출력으로 JSON-RPC 메시지를 주고받는다.
 * 표준출력은 메시지 통로라서 로그는 LOG_DIR/mcp의 회전 파일(없으면 표준에러)에만 쓴다.
 * Claude Desktop이 표준입력을 닫으면 끝난다.
 */
await runMcpEntry('mcp', async (app) => {
  const { closed } = await app.get(McpServerHost).connect(new StdioServerTransport());
  await closed;
});
