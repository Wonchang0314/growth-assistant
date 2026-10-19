import { Injectable } from '@nestjs/common';

/** CIMD 문서를 가져오는 포트 (바깥 경계, ADR-0015). 어떤 URL을 가져와도 되는지는 부르는 쪽이 먼저 검사한다. */
export abstract class ClientMetadataSource {
  /** [url]의 JSON 문서. 가져오지 못하면 던진다. */
  abstract fetch(url: URL): Promise<unknown>;
}

const TIMEOUT_MS = 5_000;
/** CIMD 초안이 예로 든 상한. Claude 문서는 300바이트 남짓이다. */
const MAX_BYTES = 5 * 1024;

/** HTTPS로 가져온다. 리디렉트를 따라가지 않고(허용 호스트 밖으로 새지 않게), 시간과 크기를 제한한다. */
@Injectable()
export class HttpClientMetadataSource extends ClientMetadataSource {
  async fetch(url: URL): Promise<unknown> {
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok || !res.body) throw new Error(`client_id 문서 응답 ${res.status}`);

    // 크기를 넘으면 끝까지 받지 않고 끊는다.
    const reader: ReadableStreamDefaultReader<Uint8Array> = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error(`client_id 문서가 ${MAX_BYTES}바이트보다 크다`);
      }
      chunks.push(read.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
}
