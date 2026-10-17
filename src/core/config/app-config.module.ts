import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.js';

/**
 * 진입점의 루트 모듈이 import하는 설정 모듈. Claude Desktop이 띄우면 작업 디렉터리가 프로젝트 루트가 아닐 수 있어
 * `.env` 위치를 `GROWTH_ENV_FILE`로 받는다. 이 파일을 불러올 때 환경 변수를 읽는다.
 */
export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  envFilePath: process.env.GROWTH_ENV_FILE ?? '.env',
  validate: validateEnv,
});
