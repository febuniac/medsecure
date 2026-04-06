const {
  buildConnectionConfig,
  buildPoolConfig,
  buildKnexConfig,
  buildTestDbConfig,
} = require('../src/config/database');

describe('Database Configuration (src/config/database.js)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // buildConnectionConfig
  // ---------------------------------------------------------------------------
  describe('buildConnectionConfig', () => {
    it('should return sensible defaults when no env vars are set', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;
      process.env.NODE_ENV = 'development';

      const cfg = buildConnectionConfig();
      expect(cfg).toEqual({
        host: 'localhost',
        port: 5432,
        user: 'medsecure',
        password: undefined,
        database: 'medsecure_db',
        ssl: false,
      });
    });

    it('should read connection details from env vars', () => {
      process.env.DB_HOST = '10.0.0.5';
      process.env.DB_PORT = '5433';
      process.env.DB_USER = 'admin';
      process.env.DB_PASSWORD = 's3cret';
      process.env.DB_NAME = 'prod_db';
      process.env.NODE_ENV = 'production';

      const cfg = buildConnectionConfig();
      expect(cfg.host).toBe('10.0.0.5');
      expect(cfg.port).toBe(5433);
      expect(cfg.user).toBe('admin');
      expect(cfg.password).toBe('s3cret');
      expect(cfg.database).toBe('prod_db');
      expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should allow overrides to take precedence over env vars', () => {
      process.env.DB_HOST = 'env-host';

      const cfg = buildConnectionConfig({ host: 'override-host', database: 'override_db' });
      expect(cfg.host).toBe('override-host');
      expect(cfg.database).toBe('override_db');
    });
  });

  // ---------------------------------------------------------------------------
  // buildPoolConfig
  // ---------------------------------------------------------------------------
  describe('buildPoolConfig', () => {
    it('should return default pool settings with max of 20', () => {
      delete process.env.DB_POOL_MIN;
      delete process.env.DB_POOL_MAX;
      delete process.env.DB_POOL_IDLE_TIMEOUT_MS;
      delete process.env.DB_POOL_ACQUIRE_TIMEOUT_MS;
      delete process.env.DB_POOL_REAP_INTERVAL_MS;
      delete process.env.DB_POOL_CREATE_RETRY_INTERVAL_MS;
      delete process.env.DB_POOL_PROPAGATE_CREATE_ERROR;

      const pool = buildPoolConfig();
      expect(pool.min).toBe(2);
      expect(pool.max).toBe(20);
      expect(pool.idleTimeoutMillis).toBe(30000);
      expect(pool.acquireTimeoutMillis).toBe(30000);
      expect(pool.reapIntervalMillis).toBe(1000);
      expect(pool.createRetryIntervalMillis).toBe(200);
      expect(pool.propagateCreateError).toBe(true);
      expect(typeof pool.afterCreate).toBe('function');
    });

    it('should read pool settings from env vars', () => {
      process.env.DB_POOL_MIN = '5';
      process.env.DB_POOL_MAX = '50';
      process.env.DB_POOL_IDLE_TIMEOUT_MS = '60000';
      process.env.DB_POOL_ACQUIRE_TIMEOUT_MS = '15000';

      const pool = buildPoolConfig();
      expect(pool.min).toBe(5);
      expect(pool.max).toBe(50);
      expect(pool.idleTimeoutMillis).toBe(60000);
      expect(pool.acquireTimeoutMillis).toBe(15000);
    });

    it('should allow overrides to take precedence', () => {
      process.env.DB_POOL_MAX = '50';

      const pool = buildPoolConfig({ max: '30' });
      expect(pool.max).toBe(30);
    });

    it('should honour propagateCreateError=false from env', () => {
      process.env.DB_POOL_PROPAGATE_CREATE_ERROR = 'false';

      const pool = buildPoolConfig();
      expect(pool.propagateCreateError).toBe(false);
    });

    it('afterCreate callback should invoke done with the connection', () => {
      const pool = buildPoolConfig();
      const fakeConn = {};
      const done = jest.fn();
      pool.afterCreate(fakeConn, done);
      expect(done).toHaveBeenCalledWith(null, fakeConn);
    });
  });

  // ---------------------------------------------------------------------------
  // buildKnexConfig
  // ---------------------------------------------------------------------------
  describe('buildKnexConfig', () => {
    it('should return a valid knex configuration object', () => {
      delete process.env.DB_POOL_MAX;

      const cfg = buildKnexConfig();
      expect(cfg.client).toBe('pg');
      expect(cfg.connection).toBeDefined();
      expect(cfg.pool).toBeDefined();
      expect(cfg.pool.max).toBe(20);
    });

    it('should forward connection and pool overrides', () => {
      const cfg = buildKnexConfig({
        connection: { host: 'custom-host' },
        pool: { max: '15' },
      });
      expect(cfg.connection.host).toBe('custom-host');
      expect(cfg.pool.max).toBe(15);
    });
  });

  // ---------------------------------------------------------------------------
  // buildTestDbConfig
  // ---------------------------------------------------------------------------
  describe('buildTestDbConfig', () => {
    it('should default to test database name and smaller pool', () => {
      delete process.env.TEST_DB_NAME;
      delete process.env.TEST_DB_HOST;

      const cfg = buildTestDbConfig();
      expect(cfg.client).toBe('pg');
      expect(cfg.connection.database).toBe('medsecure_test_db');
      expect(cfg.pool.min).toBe(1);
      expect(cfg.pool.max).toBe(5);
    });

    it('should prefer TEST_DB_* env vars over DB_* env vars', () => {
      process.env.DB_HOST = 'primary-host';
      process.env.TEST_DB_HOST = 'test-host';
      process.env.DB_NAME = 'primary_db';
      process.env.TEST_DB_NAME = 'test_db';

      const cfg = buildTestDbConfig();
      expect(cfg.connection.host).toBe('test-host');
      expect(cfg.connection.database).toBe('test_db');
    });

    it('should fall back to DB_* env vars when TEST_DB_* are not set', () => {
      process.env.DB_HOST = 'primary-host';
      delete process.env.TEST_DB_HOST;
      delete process.env.TEST_DB_NAME;

      const cfg = buildTestDbConfig();
      expect(cfg.connection.host).toBe('primary-host');
      // database falls back to the hardcoded test default, not DB_NAME
      expect(cfg.connection.database).toBe('medsecure_test_db');
    });

    it('should allow pool overrides for the test config', () => {
      const cfg = buildTestDbConfig({ pool: { max: '10' } });
      expect(cfg.pool.max).toBe(10);
    });
  });
});
