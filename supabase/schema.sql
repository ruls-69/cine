-- Run with the database owner through Supabase SQL Editor / migrate_data.py.
-- This schema must NOT be added to the Supabase Data API exposed schemas.
BEGIN;
CREATE SCHEMA IF NOT EXISTS erp_private;
REVOKE ALL ON SCHEMA erp_private FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='erp_app') THEN
    CREATE ROLE erp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS erp_private.schema_versions (
  version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS erp_private.state (
  id integer PRIMARY KEY CHECK(id=1),
  body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS erp_private.auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL, auth_version text NOT NULL,
  expires_at double precision NOT NULL, last_seen double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON erp_private.auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS erp_private.login_attempts (
  key text PRIMARY KEY, window_start double precision NOT NULL,
  attempts integer NOT NULL, blocked_until double precision NOT NULL DEFAULT 0
);
REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON SCHEMA erp_private FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON SCHEMA erp_private FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM authenticated;
  END IF;
END $$;
GRANT USAGE ON SCHEMA erp_private TO erp_app;
GRANT SELECT ON erp_private.schema_versions TO erp_app;
GRANT SELECT,UPDATE ON erp_private.state TO erp_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON erp_private.auth_sessions,erp_private.login_attempts TO erp_app;
ALTER TABLE erp_private.state ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_runtime_state ON erp_private.state;
CREATE POLICY erp_runtime_state ON erp_private.state TO erp_app USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS erp_runtime_sessions ON erp_private.auth_sessions;
CREATE POLICY erp_runtime_sessions ON erp_private.auth_sessions TO erp_app USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS erp_runtime_attempts ON erp_private.login_attempts;
CREATE POLICY erp_runtime_attempts ON erp_private.login_attempts TO erp_app USING(true) WITH CHECK(true);
INSERT INTO erp_private.schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
