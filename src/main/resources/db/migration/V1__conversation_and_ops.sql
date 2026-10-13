-- 1단계 MVP: 튜터링 대화와 운영 테이블 (설계 문서 5.5)

CREATE TABLE conversation_session (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    discord_thread_id bigint      NOT NULL UNIQUE,
    topic             text,
    status            varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED')),
    summary           text,
    answer_revealed   boolean     NOT NULL DEFAULT false,
    started_at        timestamptz NOT NULL,
    closed_at         timestamptz
);

CREATE INDEX idx_conversation_session_active ON conversation_session (status) WHERE status = 'ACTIVE';

CREATE TABLE conversation_message (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id bigint      NOT NULL REFERENCES conversation_session (id),
    role       varchar(16) NOT NULL CHECK (role IN ('USER', 'TUTOR')),
    content    text        NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE INDEX idx_conversation_message_session ON conversation_message (session_id, id);

CREATE TABLE llm_call_log (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purpose      varchar(32) NOT NULL,
    model        varchar(64) NOT NULL,
    duration_ms  bigint      NOT NULL,
    success      boolean     NOT NULL,
    input_chars  integer     NOT NULL,
    output_chars integer     NOT NULL,
    error        text,
    created_at   timestamptz NOT NULL
);

CREATE INDEX idx_llm_call_log_created_at ON llm_call_log (created_at);

CREATE TABLE app_setting (
    key   varchar(128) PRIMARY KEY,
    value text NOT NULL
);
