import { customType } from 'drizzle-orm/pg-core';

/**
 * Discord snowflake ID 컬럼. DB에는 `bigint`로, 코드에는 discord.js와 같은 문자열로 둔다.
 * JS number는 2^53을 넘으면 정밀도를 잃고, pg 드라이버는 bigint를 문자열로 돌려준다.
 */
export const snowflake = customType<{ data: string; driverData: string }>({
  dataType: () => 'bigint',
});
