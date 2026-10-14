import { type ChildProcess, spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { ClaudeException } from './claude.client.js';

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** 외부 프로세스 실행. 테스트에서 실제 CLI 없이 바꿔 끼우려고 분리했다. */
export abstract class ClaudeProcessRunner {
  /** [timeoutMs]를 넘기면 프로세스를 강제 종료하고 TIMEOUT을 던진다. */
  abstract run(command: string[], stdin: string, workDir: string, timeoutMs: number): Promise<ProcessResult>;
}

@Injectable()
export class OsClaudeProcessRunner extends ClaudeProcessRunner {
  run(command: string[], stdin: string, workDir: string, timeoutMs: number): Promise<ProcessResult> {
    const [file, ...args] = command;
    if (file === undefined) return Promise.reject(new Error('실행할 명령이 비어 있다'));

    return new Promise((resolve, reject) => {
      // 새 프로세스 그룹으로 띄워 타임아웃 때 CLI가 띄운 자식 프로세스까지 한 번에 끝낸다.
      const child = spawn(file, args, { cwd: workDir, detached: true, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // 출력을 읽지 않으면 파이프 버퍼가 차서 프로세스가 멈추므로 계속 읽는다.
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
      // 프로세스가 입력을 다 읽기 전에 끝나면 EPIPE가 난다. 결과는 종료 코드로 판단한다.
      child.stdin.on('error', () => undefined);

      const timer = setTimeout(() => {
        timedOut = true;
        killGroup(child);
      }, timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new ClaudeException('TIMEOUT', `${timeoutMs}ms를 넘겨 프로세스를 종료했다`));
        } else {
          resolve({ exitCode: code ?? -1, stdout, stderr });
        }
      });

      child.stdin.end(stdin);
    });
  }
}

function killGroup(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // 이미 끝났다.
  }
}
