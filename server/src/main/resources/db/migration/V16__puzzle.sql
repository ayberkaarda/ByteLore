-- The daily bug hunt: one authored puzzle per calendar day, identical for every
-- player, the attempts made against it, and the streaks those attempts build.
--
-- Every puzzle reaches the public through review. There is deliberately no
-- "the author publishes their own work" shortcut of the kind a blog post has:
-- a puzzle is shown to the entire platform on one day, everybody sees the same
-- listing, and a wrong answer key is visible to all of them at once. Review is
-- therefore the only road to PUBLISHED, and the state machine below admits no
-- other.

CREATE TABLE puzzles (
    id                   uuid         NOT NULL,
    status               varchar(20)  NOT NULL DEFAULT 'DRAFT',
    -- The calendar day this puzzle runs on, read in UTC. One day, one puzzle.
    puzzle_date          date         NOT NULL,
    title                varchar(200) NOT NULL,
    prompt_markdown      text,
    language             varchar(40)  NOT NULL,
    -- Stored with LF endings only. A line number is the answer to this puzzle,
    -- so a checkout's line endings must never reach this column: a CRLF body
    -- counted one way by the author and another by the reader would move the
    -- answer without anybody editing anything.
    code                 text         NOT NULL,
    -- One-based index into `code`, counting lines from 1. The upper bound
    -- depends on the code itself and is enforced where both values are in hand.
    buggy_line           integer      NOT NULL,
    explanation_markdown text         NOT NULL,
    created_by           uuid         NOT NULL,
    published_at         timestamptz,
    created_at           timestamptz  NOT NULL,
    updated_at           timestamptz  NOT NULL,
    version              bigint       NOT NULL DEFAULT 0,
    CONSTRAINT pk_puzzles PRIMARY KEY (id),
    CONSTRAINT fk_puzzles_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT ck_puzzles_status
        CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED')),
    CONSTRAINT ck_puzzles_buggy_line CHECK (buggy_line >= 1),
    CONSTRAINT ck_puzzles_code CHECK (
        btrim(code) <> '' AND position(chr(13) in code) = 0
    ),
    CONSTRAINT ck_puzzles_language CHECK (language ~ '^[a-z0-9][a-z0-9+#._-]*$'),
    CONSTRAINT ck_puzzles_explanation CHECK (btrim(explanation_markdown) <> ''),
    CONSTRAINT ck_puzzles_published_at CHECK (
        (status = 'PUBLISHED') = (published_at IS NOT NULL)
    )
);

-- A date belongs to at most one puzzle that is still alive. A rejected draft is
-- excluded on purpose: rejecting one is how an editor frees the day up again,
-- and a plain unique index would hold the date hostage to a puzzle nobody will
-- ever run.
CREATE UNIQUE INDEX ux_puzzles_date_active ON puzzles (puzzle_date) WHERE status <> 'REJECTED';

-- "Today's puzzle" and the editor's status-filtered list read this.
CREATE INDEX ix_puzzles_status_date ON puzzles (status, puzzle_date);

CREATE TABLE puzzle_attempts (
    id             uuid        NOT NULL,
    puzzle_id      uuid        NOT NULL,
    user_id        uuid        NOT NULL,
    selected_line  integer     NOT NULL,
    correct        boolean     NOT NULL,
    -- Measured by the client's own clock and therefore untrusted. It orders a
    -- scoreboard and decides nothing else; it never feeds a streak, a grant or
    -- any other durable state.
    elapsed_millis bigint      NOT NULL,
    submitted_at   timestamptz NOT NULL,
    CONSTRAINT pk_puzzle_attempts PRIMARY KEY (id),
    -- One shot per player per puzzle. The rule lives in the database rather
    -- than only in a service check, because two requests that arrive together
    -- would both pass a read-then-write check and only one of them can win here.
    CONSTRAINT uq_puzzle_attempts_player UNIQUE (puzzle_id, user_id),
    CONSTRAINT fk_puzzle_attempts_puzzle FOREIGN KEY (puzzle_id) REFERENCES puzzles (id),
    CONSTRAINT fk_puzzle_attempts_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_puzzle_attempts_selected_line CHECK (selected_line >= 1),
    CONSTRAINT ck_puzzle_attempts_elapsed CHECK (elapsed_millis >= 0)
);

-- The fastest correct solvers of one puzzle.
CREATE INDEX ix_puzzle_attempts_leaderboard
    ON puzzle_attempts (puzzle_id, elapsed_millis) WHERE correct;

CREATE TABLE user_streaks (
    user_id          uuid        NOT NULL,
    current_streak   integer     NOT NULL DEFAULT 0,
    longest_streak   integer     NOT NULL DEFAULT 0,
    -- The date of the most recent correct solve. A streak is broken by the gap
    -- between this value and the next solved date, which is why no scheduled
    -- job has to walk the table at midnight to break anything: a missed day is
    -- read off the arithmetic at the moment the next correct answer arrives.
    last_solved_date date,
    updated_at       timestamptz NOT NULL,
    CONSTRAINT pk_user_streaks PRIMARY KEY (user_id),
    CONSTRAINT fk_user_streaks_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_user_streaks_current CHECK (current_streak >= 0),
    CONSTRAINT ck_user_streaks_longest CHECK (longest_streak >= current_streak),
    CONSTRAINT ck_user_streaks_pairing CHECK (
        (current_streak = 0) = (last_solved_date IS NULL)
    )
);

-- Append-only, written in the same transaction as the transition it describes.
-- Kept separate from the blog pipeline's own trail rather than shared with it:
-- that table's columns are typed to blog statuses and its rows point at a blog
-- post through a foreign key, and every one of its steps has a machine actor it
-- permits. Here every step is a person's decision, so actor_user_id is NOT NULL
-- -- a distinction worth having in the schema rather than in a convention.
CREATE TABLE puzzle_audit_log (
    id            uuid        NOT NULL,
    step          varchar(16) NOT NULL,
    puzzle_id     uuid        NOT NULL,
    actor_user_id uuid        NOT NULL,
    from_status   varchar(20),
    to_status     varchar(20),
    reason        varchar(500),
    occurred_at   timestamptz NOT NULL,
    CONSTRAINT pk_puzzle_audit_log PRIMARY KEY (id),
    CONSTRAINT fk_puzzle_audit_log_puzzle FOREIGN KEY (puzzle_id) REFERENCES puzzles (id),
    CONSTRAINT fk_puzzle_audit_log_actor FOREIGN KEY (actor_user_id) REFERENCES users (id),
    CONSTRAINT ck_puzzle_audit_log_step
        CHECK (step IN ('DRAFT', 'SUBMIT', 'APPROVE', 'REJECT')),
    CONSTRAINT ck_puzzle_audit_log_from_status CHECK (
        from_status IS NULL
        OR from_status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED')
    ),
    CONSTRAINT ck_puzzle_audit_log_to_status CHECK (
        to_status IS NULL
        OR to_status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED')
    )
);

-- One puzzle's trail, in the order it happened.
CREATE INDEX ix_puzzle_audit_log_puzzle ON puzzle_audit_log (puzzle_id, occurred_at);
