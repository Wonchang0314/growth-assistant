import { type Column, ilike, or, type SQL, sql } from 'drizzle-orm';

/** CHECK 제약의 `IN (...)` 목록. 값은 코드의 `as const` 배열이라 그대로 넣는다. */
export const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * [columns] 중 하나에 [terms] 중 하나라도 들어 있는지(대소문자 무시). 검색어의 `%`·`_`·`\`는 글자 그대로 찾는다.
 * 검색어가 없으면 undefined라 호출하는 쪽에서 쿼리를 건너뛴다.
 */
export function containsAnyTerm(columns: readonly (Column | SQL)[], terms: readonly string[]): SQL | undefined {
  const patterns = terms.map((term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  return or(...patterns.flatMap((pattern) => columns.map((column) => ilike(column, pattern))));
}
