import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClockModule } from './core/clock/clock.module.js';
import { Clock } from './core/clock/clock.js';
import { AppConfigModule } from './core/config/app-config.module.js';
import { DbModule } from './core/db/db.module.js';
import { ConceptRepository } from './core/knowledge/concept.repository.js';
import { LlmModule } from './core/llm/llm.module.js';
import { StderrLogger } from './core/logging/stderr-logger.js';
import { DomainTermRepository } from './core/memory/domain-term.repository.js';
import { DomainTermService } from './core/memory/domain-term.service.js';
import { parseTermFile, termCandidates, toTermFile } from './core/memory/domain-term.js';
import { SourceDocumentRepository } from './core/memory/source-document.repository.js';

/*
 * 회사 고유 용어 관리 (`npm run terms -- <명령>`). 용어는 레포에 남기지 않도록 레포 밖 TSV 파일과 DB에만 둔다.
 *   candidates [파일]  수집한 청크에서 후보를 뽑고, Claude가 회사 고유 용어를 골라 일반 표현을 채운 파일을 쓴다
 *   import [파일]      일반 표현(replacement)이 채워진 줄로 DB의 용어 목록을 맞춘다 (빠진 용어는 지운다)
 *   list               등록된 용어를 보여 준다
 */
const DEFAULT_FILE = join(homedir(), '.growth-assistant', 'domain-terms.tsv');
const REPO_DIR = resolve(import.meta.dirname, '..');

@Module({
  imports: [AppConfigModule, ClockModule, DbModule.forRoot({ migrate: false }), LlmModule],
  providers: [SourceDocumentRepository, ConceptRepository, DomainTermRepository, DomainTermService],
})
class TermsAppModule {}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { force: { type: 'boolean' } } });
const [command, fileArg] = positionals;
const file = resolve(fileArg ?? DEFAULT_FILE);

const app = await NestFactory.createApplicationContext(TermsAppModule, { logger: new StderrLogger() });
const terms = app.get(DomainTermRepository);
try {
  switch (command) {
    case 'candidates': {
      if (!relative(REPO_DIR, file).startsWith('..')) throw new Error(`레포 안에는 쓰지 않는다: ${file}`);
      if (existsSync(file) && !values.force) {
        throw new Error(`이미 있다: ${file}. 고친 내용을 먼저 import하거나, 덮어쓰려면 --force`);
      }
      const documents = app.get(SourceDocumentRepository);
      const [chunks, titles, concepts, existing] = await Promise.all([
        documents.allChunkContents(),
        documents.allTitles(),
        app.get(ConceptRepository).findActiveTerms(),
        terms.findAll(),
      ]);
      const known = [...concepts.flatMap((c) => [c.name, ...c.aliases]), ...existing.map((t) => t.term)];
      const candidates = termCandidates(chunks, known);
      process.stderr.write(`후보 ${candidates.length}개를 Claude에게 분류시킨다 (몇 분 걸린다)\n`);
      const suggestions = await app.get(DomainTermService).suggest(candidates, titles);
      writeFileSync(file, toTermFile({ existing, suggestions, candidates }));
      process.stderr.write(
        `등록된 용어 ${existing.length}개, 제안 ${suggestions.length}개, 나머지 후보를 썼다: ${file}\n` +
          '제안 줄의 일반 표현을 확인해 고치고, 회사 용어가 아닌 제안은 replacement를 지운다. 빠진 용어는 줄을 더한다. 그다음 import한다.\n',
      );
      break;
    }
    case 'import': {
      const parsed = parseTermFile(readFileSync(file, 'utf8'));
      const r = await terms.replaceAll(parsed, app.get(Clock).now());
      process.stderr.write(`용어 ${parsed.length}개로 맞췄다 (새로 ${r.added}, 지움 ${r.removed})\n`);
      break;
    }
    case 'list': {
      for (const t of await terms.findAll()) {
        process.stdout.write(`${t.term}\t→ ${t.replacement}${t.isPattern ? '\t(정규식)' : ''}\n`);
      }
      break;
    }
    default:
      throw new Error('명령: candidates [파일] | import [파일] | list');
  }
} finally {
  await app.close();
}
