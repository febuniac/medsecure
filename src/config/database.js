const { logger } = require('../utils/logger');

const defaultPoolConfig = {
  min: 2,
  max: 20,
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 200,
  propagateCreateError: false,
  afterCreate: (conn, done) => {
    logger.info({ type: 'DB_POOL', action: 'connection_created' });
    done(null, conn);
  }
};

function buildConnectionConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.DB_HOST || 'localhost',
    port: overrides.port || process.env.DB_PORT || 5432,
    user: overrides.user || process.env.DB_USER || 'medsecure',
    password: overrides.password || process.env.DB_PASSWORD,
    database: overrides.database || process.env.DB_NAME || 'medsecure_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
  };
}

function buildKnexConfig(connectionOverrides = {}, poolOverrides = {}) {
  return {
    client: 'pg',
    connection: buildConnectionConfig(connectionOverrides),
    pool: { ...defaultPoolConfig, ...poolOverrides }
  };
}

function buildTestDbConfig(poolOverrides = {}) {
  return buildKnexConfig(
    {
      host: process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost',
      port: process.env.TEST_DB_PORT || process.env.DB_PORT || 5432,
      user: process.env.TEST_DB_USER || process.env.DB_USER || 'medsecure',
      password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.TEST_DB_NAME || 'medsecure_test_db'
    },
    { min: 1, max: 5, ...poolOverrides }
  );
}

module.exports = {
  defaultPoolConfig,
  buildConnectionConfig,
  buildKnexConfig,
  buildTestDbConfig
};
