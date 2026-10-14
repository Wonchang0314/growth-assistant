import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OsClaudeProcessRunner } from './claude-process.runner.js';

/** 실제 프로세스를 띄운다. 개발(WSL)·운영(macOS) 모두 `sh`가 있다. */
describe('OsClaudeProcessRunner', () => {
  const runner = new OsClaudeProcessRunner();
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'claude-runner-'));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('표준입력을 넘기고 표준출력·표준오류·종료 코드를 받는다', async () => {
    const result = await runner.run(['sh', '-c', 'cat; echo err >&2; exit 3'], '안녕', workDir, 5_000);

    expect(result).toEqual({ exitCode: 3, stdout: '안녕', stderr: 'err\n' });
  });

  it('작업 디렉터리에서 실행한다', async () => {
    const result = await runner.run(['pwd'], '', workDir, 5_000);

    expect(result.stdout.trim()).toBe(realpathSync(workDir));
  });

  it('시간을 넘기면 프로세스를 끝내고 TIMEOUT을 던진다', async () => {
    const startedAt = performance.now();

    await expect(runner.run(['sleep', '30'], '', workDir, 300)).rejects.toMatchObject({ type: 'TIMEOUT' });
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });

  it('시간을 넘기면 CLI가 띄운 자식 프로세스까지 끝낸다', async () => {
    const pidFile = join(workDir, 'child.pid');

    await expect(
      runner.run(['sh', '-c', `sleep 30 & echo $! > ${pidFile}; wait`], '', workDir, 300),
    ).rejects.toMatchObject({ type: 'TIMEOUT' });

    const childPid = Number(readFileSync(pidFile, 'utf8').trim());
    await expect.poll(() => isAlive(childPid), { timeout: 2_000 }).toBe(false);
  });

  it('실행 파일이 없으면 오류를 던진다', async () => {
    // 절대 경로로 둔다. 이름만 주면 PATH를 뒤지는데, WSL에서는 PATH의 Windows 경로(/mnt/c, 9P)에서
    // exec가 멈춰 spawn이 이벤트 루프를 막는 경우가 있다 (2026-10-14 확인, 운영 macOS와는 무관).
    await expect(runner.run([join(workDir, 'no-such-command-x')], '', workDir, 5_000)).rejects.toThrow(/ENOENT/);
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
