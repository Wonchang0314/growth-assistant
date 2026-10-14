import 'reflect-metadata';
import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { FileLogger } from './core/logging/file-logger.js';

// 운영(launchd)에서는 LOG_DIR에 회전하는 로그 파일을 쓴다. 지정하지 않으면 콘솔에 쓴다 (ops/install.sh).
// 설정 모듈이 뜨기 전에 로거를 정해야 해서 환경 변수를 직접 읽는다.
const logDir = process.env.LOG_DIR;
const fileLogger = logDir ? await FileLogger.create(logDir) : undefined;
process.on('exit', () => fileLogger?.flush());

try {
  // HTTP 서버가 없는 봇이라 애플리케이션 컨텍스트만 띄운다. Discord 연결과 예약 작업이 프로세스를 유지한다.
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    ...(fileLogger ? { logger: fileLogger } : {}),
  });
  app.enableShutdownHooks();
  Logger.log('growth-assistant 시작', 'Bootstrap');
} catch (e) {
  // 시작에 실패하면(DB가 아직 안 뜸 등) 로그 파일에도 남기고 오류로 끝낸다. launchd가 30초 뒤 다시 띄운다.
  if (fileLogger) {
    // inspect는 cause까지 펼친다 (예: Drizzle "Failed query" 아래의 ECONNREFUSED).
    fileLogger.error('시작 실패', inspect(e), 'Bootstrap');
    await fileLogger.close();
  }
  throw e;
}
