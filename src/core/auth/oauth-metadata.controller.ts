import { Controller, Get } from '@nestjs/common';
import {
  buildOAuthProtectedResourceMetadata,
  type OAuthMetadata,
  type OAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/server';
import { AuthSettings } from './auth-settings.js';

/**
 * 흐름 ①: 클라이언트가 처음 읽는 두 메타데이터 문서. `/mcp`가 `401`로 보낸 `resource_metadata` 주소에서
 * 보호 리소스 메타데이터를 읽고, 거기 적힌 인가 서버(이 서버)의 메타데이터에서 `/authorize`·`/token` 주소를 찾는다.
 */
@Controller('.well-known')
export class OAuthMetadataController {
  constructor(private readonly settings: AuthSettings) {}

  /**
   * RFC 9728 보호 리소스 메타데이터. 경로 규칙상 `/mcp`의 문서는 `/.well-known/oauth-protected-resource/mcp`이고,
   * 경로를 빼고 찾는 클라이언트를 위해 루트에서도 같은 문서를 준다. `resource`는 MCP URL과 정확히 같아야 한다.
   */
  @Get(['oauth-protected-resource/mcp', 'oauth-protected-resource'])
  protectedResource(): OAuthProtectedResourceMetadata {
    return buildOAuthProtectedResourceMetadata({
      oauthMetadata: this.authorizationServer(),
      resourceServerUrl: new URL(this.settings.mcpUrl),
      resourceName: 'growth-assistant',
    });
  }

  /**
   * RFC 8414 인가 서버 메타데이터. `client_id_metadata_document_supported`와 `token_endpoint_auth_methods_supported: ["none"]`이
   * 함께 있어야 Claude가 등록(DCR) 대신 CIMD를 쓴다.
   */
  @Get('oauth-authorization-server')
  authorizationServer(): OAuthMetadata {
    const { issuer } = this.settings;
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    };
  }
}
