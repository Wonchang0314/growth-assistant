import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { DB } from '../db/db.module.js';
import { HealthController } from './health.controller.js';

// DB에 닿는 200은 test/mcp-http.db.spec.ts가 본다. 여기서는 쿼리가 실패하는 DB를 넣는다.
let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: DB, useValue: { execute: () => Promise.reject(new Error('connect ECONNREFUSED')) } }],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => {
  await app.close();
});

it('DB에 닿지 않으면 503이다', async () => {
  const res = await fetch(new URL('/healthz', await app.getUrl()));

  expect(res.status).toBe(503);
});
