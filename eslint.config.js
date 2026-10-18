import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // .claude/worktrees는 다른 세션이 쓰는 git 워크트리다(그 안에서 따로 검사한다).
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.claude/worktrees/'] },
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
  prettier,
);
