import { ClientMetadataSource } from '../../src/core/auth/client-metadata.source.js';

/** 시험용 Claude 클라이언트. 호스팅 앱처럼 claude.ai의 CIMD URL과 콜백을 쓴다. */
export const TEST_CLIENT = {
  clientId: 'https://claude.ai/oauth/test-client-metadata',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
} as const;

/** 네트워크 없이 CIMD 문서를 준다. [documents]에 없는 URL은 가져오지 못한 것으로 던진다. */
export class FakeClientMetadataSource extends ClientMetadataSource {
  readonly documents = new Map<string, unknown>([
    [
      TEST_CLIENT.clientId,
      {
        client_id: TEST_CLIENT.clientId,
        client_name: 'Claude',
        redirect_uris: [TEST_CLIENT.redirectUri],
        token_endpoint_auth_method: 'none',
      },
    ],
  ]);
  readonly fetched: string[] = [];

  fetch(url: URL): Promise<unknown> {
    this.fetched.push(url.href);
    const document = this.documents.get(url.href);
    return document === undefined ? Promise.reject(new Error(`404 ${url.href}`)) : Promise.resolve(document);
  }
}
