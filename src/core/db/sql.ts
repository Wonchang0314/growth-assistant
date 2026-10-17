import { sql } from 'drizzle-orm';

/** CHECK 제약의 `IN (...)` 목록. 값은 코드의 `as const` 배열이라 그대로 넣는다. */
export const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));
