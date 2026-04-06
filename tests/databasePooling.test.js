const { defaultPoolConfig, buildConnectionConfig, buildKnexConfig, buildTestDbConfig } = require('../src/config/database');

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Database Connection Pooling Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('defaultPoolConfig', () => {
    it('should have a max pool size of 20', () => {
      expect(defaultPoolConfig.max).toBe(20);
    });

    it('should have a min pool size of 2', () => {
      expect(defaultPoolConfig.min).toBe(2);
    });

    it('should set acquireTimeoutMillis', () => {
      expect(defaultPoolConfig.acquireTimeoutMillis).toBe(30000);
    });

    it('should set createTimeoutMillis', () => {
      expect(defaultPoolConfig.createTimeoutMillis).toBe(30000);
    });

    it('should set idleTimeoutMillis', () => {
      expect(defaultPoolConfig.idleTimeoutMillis).toBe(30000);
    });

    it('should set destroyTimeoutMillis', () => {
      expect(defaultPoolConfig.destroyTimeoutMillis).toBe(5000);
    });

    it('should set reapIntervalMillis', () => {
      expect(defaultPoolConfig.reapIntervalMillis).toBe(1000);
    });

    it('should have an afterCreate callback', () => {
      expect(typeof defaultPoolConfig.afterCreate).toBe('function');
    });

    it('should call done callback in afterCreate', () => {
      const mockConn = {};
      const mockDone = jest.fn();
      defaultPoolConfig.afterCreate(mockConn, mockDone);
      expect(mockDone).toHaveBeenCalledWith(null, mockConn);
    });

    it('should not propagate create errors by default', () => {
      expect(defaultPoolConfig.propagateCreateError).toBe(false);
    });
  });

  describe('buildConnectionConfig', () => {
    it('should use default values when no env vars are set', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;
      delete process.env.NODE_ENV;

      const config = buildConnectionConfig();
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.user).toBe('medsecure');
      expect(config.database).toBe('medsecure_db');
      expect(config.ssl).toBe(false);
    });

    it('should use environment variables when set', () => {
      process.env.DB_HOST = 'db.example.com';
      process.env.DB_PORT = '5433';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'secret123';
      process.env.DB_NAME = 'custom_db';

      const config = buildConnectionConfig();
      expect(config.host).toBe('db.example.com');
      expect(config.port).toBe('5433');
      expect(config.user).toBe('custom_user');
      expect(config.password).toBe('secret123');
      expect(config.database).toBe('custom_db');
    });

    it('should allow overrides to take precedence over env vars', () => {
      process.env.DB_HOST = 'env-host.com';

      const config = buildConnectionConfig({ host: 'override-host.com' });
      expect(config.host).toBe('override-host.com');
    });

    it('should enable SSL with rejectUnauthorized in production', () => {
      process.env.NODE_ENV = 'production';

      const config = buildConnectionConfig();
      expect(config.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should disable SSL in non-production', () => {
      process.env.NODE_ENV = 'development';

      const config = buildConnectionConfig();
      expect(config.ssl).toBe(false);
    });
  });

  describe('buildKnexConfig', () => {
    it('should return a valid knex configuration with pg client', () => {
      const config = buildKnexConfig();
      expect(config.client).toBe('pg');
      expect(config.connection).toBeDefined();
      expect(config.pool).toBeDefined();
    });

    it('should include default pool config', () => {
      const config = buildKnexConfig();
      expect(config.pool.max).toBe(20);
      expect(config.pool.min).toBe(2);
      expect(config.pool.acquireTimeoutMillis).toBe(30000);
      expect(config.pool.idleTimeoutMillis).toBe(30000);
    });

    it('should allow pool overrides', () => {
      const config = buildKnexConfig({}, { max: 50, min: 5 });
      expect(config.pool.max).toBe(50);
      expect(config.pool.min).toBe(5);
      expect(config.pool.acquireTimeoutMillis).toBe(30000);
    });

    it('should allow connection overrides', () => {
      const config = buildKnexConfig({ host: 'custom-host', database: 'custom_db' });
      expect(config.connection.host).toBe('custom-host');
      expect(config.connection.database).toBe('custom_db');
    });
  });

  describe('buildTestDbConfig', () => {
    it('should use TEST_DB env vars when available', () => {
      process.env.TEST_DB_HOST = 'test-db-host.com';
      process.env.TEST_DB_PORT = '5434';
      process.env.TEST_DB_USER = 'test_user';
      process.env.TEST_DB_PASSWORD = 'test_secret';
      process.env.TEST_DB_NAME = 'test_database';

      const config = buildTestDbConfig();
      expect(config.connection.host).toBe('test-db-host.com');
      expect(config.connection.port).toBe('5434');
      expect(config.connection.user).toBe('test_user');
      expect(config.connection.password).toBe('test_secret');
      expect(config.connection.database).toBe('test_database');
    });

    it('should fall back to DB env vars for test config', () => {
      delete process.env.TEST_DB_HOST;
      delete process.env.TEST_DB_PORT;
      delete process.env.TEST_DB_USER;
      delete process.env.TEST_DB_PASSWORD;
      delete process.env.TEST_DB_NAME;
      process.env.DB_HOST = 'primary-host.com';
      process.env.DB_USER = 'primary_user';

      const config = buildTestDbConfig();
      expect(config.connection.host).toBe('primary-host.com');
      expect(config.connection.user).toBe('primary_user');
      expect(config.connection.database).toBe('medsecure_test_db');
    });

    it('should use smaller pool for test db by default', () => {
      const config = buildTestDbConfig();
      expect(config.pool.min).toBe(1);
      expect(config.pool.max).toBe(5);
    });

    it('should allow pool overrides for test db', () => {
      const config = buildTestDbConfig({ max: 10 });
      expect(config.pool.max).toBe(10);
    });
  });

  describe('db module (src/models/db.js)', () => {
    it('should produce a knex config with pooled settings via buildKnexConfig', () => {
      const config = buildKnexConfig();
      expect(config.client).toBe('pg');
      expect(config.pool).toBeDefined();
      expect(config.pool.max).toBe(20);
      expect(config.pool.min).toBe(2);
      expect(config.pool.acquireTimeoutMillis).toBe(30000);
      expect(config.pool.idleTimeoutMillis).toBe(30000);
      expect(config.pool.afterCreate).toBeDefined();
    });

    it('should no longer use the old hardcoded pool config (max: 10)', () => {
      const config = buildKnexConfig();
      expect(config.pool.max).not.toBe(10);
      expect(config.pool.max).toBe(20);
    });
  });
});
