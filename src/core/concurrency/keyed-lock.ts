/**
 * 키마다 작업을 하나씩 차례로 실행한다. 다른 키의 작업은 서로 기다리지 않는다.
 *
 * Node는 단일 스레드지만 `await`에서 다른 작업이 끼어든다. 예를 들어 같은 스레드에 메시지가 연달아 오면
 * 두 작업이 모두 "세션 없음"을 보고 세션을 두 번 만들 수 있어, 읽고-판단하고-쓰는 구간을 키별로 묶는다.
 */
export class KeyedLock {
  /** 키별 마지막 작업이 끝나는 시점. 대기 중인 작업이 없으면 키를 지운다. */
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => done);
    this.tails.set(key, tail);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** 대기 중이거나 실행 중인 작업이 있는 키의 수. */
  get size(): number {
    return this.tails.size;
  }
}
