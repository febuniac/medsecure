const { logger } = require('../utils/logger');

/**
 * Centralized database connection configuration with connection pooling.
 *
 * Environment variables (all optional, sensible defaults provided):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   DB_POOL_MIN, DB_POOL_MAX
 *   DB_POOL_IDLE_TIMEOUT_MS   - destroy idle connections after this many ms
 *   DB_POOL_ACQUIRE_TIMEOUT_MS - timeout when acquiring a connection from the pool
 *   DB_POOL_REAP_INTERVAL_MS  - how often to check for idle connections
 *   DB_POOL_CREATE_RETRY_INTERVAL_MS - delay between connection-create retries
 *   DB_POOL_PROPAGATE_CREATE_ERROR - whether to propagate connection-create errors
 */

function buildConnectionConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.DB_HOST || 'localhost',
    port: parseInt(overrides.port || process.env.DB_PORT || '5432', 10),
    user: overrides.user || process.env.DB_USER || 'medsecure',
    password: overrides.password || process.env.DB_PASSWORD,
    database: overrides.database || process.env.DB_NAME || 'medsecure_db',
    ssl: (overrides.ssl !== undefined)
      ? overrides.ssl
      : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false),
  };
}

function buildPoolConfig(overrides = {}) {
  return {
    min: parseInt(overrides.min || process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(overrides.max || process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(
      overrides.idleTimeoutMillis || process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000',
      10,
    ),
    acquireTimeoutMillis: parseInt(
      overrides.acquireTimeoutMillis || process.env.DB_POOL_ACQUIRE_TIMEOUT_MS || '30000',
      10,
    ),
    reapIntervalMillis: parseInt(
      overrides.reapIntervalMillis || process.env.DB_POOL_REAP_INTERVAL_MS || '1000',
      10,
    ),
    createRetryIntervalMillis: parseInt(
      overrides.createRetryIntervalMillis || process.env.DB_POOL_CREATE_RETRY_INTERVAL_MS || '200',
      10,
    ),
    propagateCreateError: overrides.propagateCreateError !== undefined
      ? overrides.propagateCreateError
      : (process.env.DB_POOL_PROPAGATE_CREATE_ERROR !== 'false'),
    afterCreate(conn, done) {
      logger.debug({ type: 'DB_POOL', action: 'connection_created', message: 'New pooled connection established' });
      done(null, conn);
    },
  };
}

function buildKnexConfig(overrides = {}) {
  const connection = buildConnectionConfig(overrides.connection);
  const pool = buildPoolConfig(overrides.pool);

  return {
    client: 'pg',
    connection,
    pool,
  };
}

function buildTestDbConfig(overrides = {}) {
  const connection = {
    host: overrides.host || process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(overrides.port || process.env.TEST_DB_PORT || process.env.DB_PORT || '5432', 10),
    user: overrides.user || process.env.TEST_DB_USER || process.env.DB_USER || 'medsecure',
    password: overrides.password || process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD,
    database: overrides.database || process.env.TEST_DB_NAME || 'medsecure_test_db',
    ssl: (overrides.ssl !== undefined)
      ? overrides.ssl
      : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false),
  };

  const pool = buildPoolConfig({ min: 1, max: 5, ...overrides.pool });

  return {
    client: 'pg',
    connection,
    pool,
  };
}

module.exports = {
  buildConnectionConfig,
  buildPoolConfig,
  buildKnexConfig,
  buildTestDbConfig,
};
