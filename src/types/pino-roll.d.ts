// pino-roll은 타입 정의를 제공하지 않는다. 이 프로젝트가 쓰는 옵션만 선언한다 (pino-roll.js의 JSDoc 참고).
declare module 'pino-roll' {
  export interface RollStream {
    write(chunk: string): boolean;
    flushSync(): void;
    /** 남은 기록을 쓰고 닫는다. 파일이 아직 열리는 중이면 열린 뒤에 닫는다 (sonic-boom). */
    end(): void;
    once(event: 'close', listener: () => void): this;
  }

  export interface PinoRollOptions {
    /** 경로 뒤에 날짜·번호·확장자가 붙는다. 예: `logs/app` → `logs/app.2026-10-14.1.log`. */
    file: string;
    /** 이 크기를 넘으면 다음 번호 파일로 넘어간다. 예: `'10m'`. */
    size?: string | number;
    frequency?: 'daily' | 'hourly' | number;
    extension?: string;
    dateFormat?: string;
    mkdir?: boolean;
    /** 같은 디렉터리에 현재 파일을 가리키는 `current.log`를 만든다. */
    symlink?: boolean;
    /** 현재 파일 말고 남겨 둘 파일 수. */
    limit?: { count?: number; removeOtherLogFiles?: boolean };
  }

  export default function pinoRoll(options: PinoRollOptions): Promise<RollStream>;
}
