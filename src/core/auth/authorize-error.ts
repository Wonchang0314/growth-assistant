/**
 * 브라우저에 오류 화면으로 보여 줄 인가 흐름의 실패. 클라이언트나 redirect_uri를 믿을 수 없을 때처럼
 * 클라이언트로 돌려보내면 안 되는 경우에 쓴다(RFC 6749 4.1.2.1). [message]는 사용자에게 그대로 보이므로 비밀값을 넣지 않는다.
 */
export class AuthorizeError extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string,
  ) {
    super(message);
  }
}
