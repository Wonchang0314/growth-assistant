import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// HTTP 서버가 없는 봇이라 애플리케이션 컨텍스트만 띄운다. Discord 연결과 예약 작업이 프로세스를 유지한다.
const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
Logger.log('growth-assistant 시작', 'Bootstrap');
