import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { appSetting } from './app-setting.schema.js';

@Injectable()
export class AppSettingRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(key: string): Promise<string | undefined> {
    const [row] = await this.db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, key));
    return row?.value;
  }

  /** 키가 있으면 값을 덮어쓴다 (INSERT … ON CONFLICT DO UPDATE). */
  async set(key: string, value: string): Promise<void> {
    await this.db
      .insert(appSetting)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSetting.key, set: { value } });
  }
}
