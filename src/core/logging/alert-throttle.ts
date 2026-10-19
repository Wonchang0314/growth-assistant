const WINDOW_MS = 3_600_000;

/**
 * 같은 종류의 알림을 1시간에 한 번만 보내게 한다. 보낸 뒤 1시간 안에 온 알림은 보내지 않고 세었다가,
 * 1시간이 지나 처음 오는 알림에 "외 N건"으로 붙인다. 상태는 프로세스 메모리라 재시작하면 처음부터 센다.
 */
export class AlertThrottle {
  private readonly windows = new Map<string, { sentAt: number; held: number }>();

  /** 지금 보내야 하면 그동안 보내지 않은 건수를, 보내지 않을 거면 `null`을 돌려준다. */
  admit(kind: string, now: Date): number | null {
    const window = this.windows.get(kind);
    if (window && now.getTime() - window.sentAt < WINDOW_MS) {
      window.held += 1;
      return null;
    }
    this.windows.set(kind, { sentAt: now.getTime(), held: 0 });
    return window?.held ?? 0;
  }
}
