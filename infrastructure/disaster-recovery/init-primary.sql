-- PostgreSQL Primary Initialization for Streaming Replication
-- HIPAA §164.308(a)(7) — Contingency Plan
--
-- Creates replication user and slot for the standby server.

-- Create replication user with minimal privileges
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'replication') THEN
    CREATE ROLE replication WITH REPLICATION LOGIN PASSWORD 'replication_dev_password';
  END IF;
END
$$;

-- Create a physical replication slot for the standby
SELECT pg_create_physical_replication_slot('medsecure_standby_slot', true)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_replication_slots WHERE slot_name = 'medsecure_standby_slot'
);

-- Grant necessary permissions for health checking
GRANT pg_monitor TO medsecure;

-- Log the setup completion
DO $$
BEGIN
  RAISE NOTICE 'MedSecure DR: Primary replication initialized successfully';
END
$$;
