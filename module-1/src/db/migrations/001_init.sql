CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE leave_type_code AS ENUM ('ANNUAL', 'SICK', 'UNPAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  role          user_role NOT NULL,
  manager_id    uuid REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_not_own_manager CHECK (manager_id IS DISTINCT FROM id)
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id),
  leave_type     leave_type_code NOT NULL,
  year           integer NOT NULL,
  allocated_days numeric(5,1) NOT NULL CHECK (allocated_days >= 0),
  used_days      numeric(5,1) NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  UNIQUE (user_id, leave_type, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES users (id),
  leave_type      leave_type_code NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days            numeric(5,1) NOT NULL CHECK (days > 0),
  reason          text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status          leave_status NOT NULL DEFAULT 'PENDING',
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  decided_by      uuid REFERENCES users (id),
  decision_reason text,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_date_order CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS leave_audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES leave_requests (id),
  actor_id         uuid NOT NULL REFERENCES users (id),
  from_status      leave_status,
  to_status        leave_status NOT NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_requests_employee_status_idx
  ON leave_requests (employee_id, status);
