import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Nest 모듈은 데코레이터만 붙은 빈 클래스다.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    // 설정 파일과 .claude/hooks의 Node 스크립트
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // ADR-0015: core는 기능 모듈(tutor)을 모른다.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/tutor/**'], message: 'core는 tutor를 모른다 (ADR-0015)' }] },
      ],
    },
  },
  // ADR-0020: quiz 모듈 안의 레이어 의존 방향. presentation → application → domain, infrastructure → application·domain.
  quizLayer(
    'domain',
    ['application', 'infrastructure', 'presentation'],
    ['@nestjs/*', 'drizzle-orm', 'drizzle-orm/*', 'zod', '@modelcontextprotocol/*'],
  ),
  quizLayer(
    'application',
    ['infrastructure', 'presentation'],
    ['drizzle-orm', 'drizzle-orm/*', '@modelcontextprotocol/*'],
  ),
  quizLayer('infrastructure', ['presentation'], []),
  prettier,
);

/** [layer] 폴더가 [layers] 폴더와 [packages]를 import하지 못하게 한다. */
function quizLayer(layer, layers, packages) {
  const patterns = [
    { group: layers.map((l) => `**/${l}/**`), message: `quiz ${layer}는 ${layers.join('·')}를 모른다 (ADR-0020)` },
  ];
  if (packages.length > 0)
    patterns.push({ group: packages, message: `quiz ${layer}는 이 라이브러리를 모른다 (ADR-0020)` });
  return { files: [`src/tutor/quiz/${layer}/**/*.ts`], rules: { 'no-restricted-imports': ['error', { patterns }] } };
}
