import { Injectable } from '@nestjs/common';
import { AppSettingRepository } from '../../../core/setting/app-setting.repository.js';
import { editGuideline, formatGuideline, GUIDELINE_KEY, parseGuideline } from '../domain/quiz-guideline.js';

/** 출제 지침: 문제 품질에 대한 사용자의 요청. 출제 프롬프트에 넣고, 대화에서 재배포 없이 고친다 (설계 문서 7.3). */
@Injectable()
export class QuizGuidelineService {
  constructor(private readonly settings: AppSettingRepository) {}

  async rules(): Promise<string[]> {
    return parseGuideline(await this.settings.get(GUIDELINE_KEY));
  }

  async edit(edit: { add: readonly string[]; remove: readonly string[] }) {
    const result = editGuideline(await this.rules(), edit);
    await this.settings.set(GUIDELINE_KEY, formatGuideline(result.rules));
    return result;
  }
}
