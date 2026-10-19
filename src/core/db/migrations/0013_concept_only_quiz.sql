-- ADR-0038: 경험에서 만든 상황 판단형(SCENARIO)을 더 내지 않고, 문제 길이에 상한(질문 150자·2문장, 보기 40자)을 둔다.
-- 1) 상황 판단형 중 풀이 기록이 없고 다른 문제가 변형으로 가리키지 않는 문제는 지운다.
--    풀이 기록이 있는 문제를 지우면 FSRS·숙련도 이력이 사라지고, 변형이 가리키는 문제는 FK로 지울 수 없다.
DELETE FROM "quiz_question" q
WHERE q."angle" = 'SCENARIO'
  AND NOT EXISTS (SELECT 1 FROM "quiz_attempt" a WHERE a."question_id" = q."id")
  AND NOT EXISTS (SELECT 1 FROM "quiz_question" v WHERE v."variant_of" = q."id");
--> statement-breakpoint
-- 2) 남은 상황 판단형과 길이 상한을 넘는 문제 중 VALID인 것은 INVALID로 둔다. 새벽 작업과 복습 세트가 새 문제로 채운다.
--    문장 수는 코드(question-gate.ts)처럼 마침표·물음표·느낌표 뒤가 공백이나 끝인 곳에서 나눈다.
UPDATE "quiz_question" q
SET "validation_status" = 'INVALID',
  "validation_note" = CASE
    WHEN q."angle" = 'SCENARIO' THEN 'ADR-0038: 경험에서 만든 상황 판단형은 더 내지 않는다'
    ELSE 'ADR-0038: 길이 상한(질문 150자·2문장, 보기 40자)을 넘는다'
  END
WHERE q."validation_status" = 'VALID'
  AND (
    q."angle" = 'SCENARIO'
    OR char_length(q."prompt") > 150
    OR coalesce(array_length(array_remove(regexp_split_to_array(btrim(q."prompt"), '[.?!](\s+|$)'), ''), 1), 0) > 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(q."choices") c WHERE char_length(c ->> 'text') > 40)
  );
