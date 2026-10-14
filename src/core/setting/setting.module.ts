import { Module } from '@nestjs/common';
import { AppSettingRepository } from './app-setting.repository.js';

@Module({
  providers: [AppSettingRepository],
  exports: [AppSettingRepository],
})
export class SettingModule {}
