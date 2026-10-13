-- 대화 중 요약(summary)에 합쳐진 마지막 메시지. 이 ID 이후 메시지만 맥락에 원문으로 넣고 다음 요약 대상으로 삼는다.
ALTER TABLE conversation_session ADD COLUMN summarized_message_id bigint;
