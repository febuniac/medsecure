const http = require('http');
const express = require('express');

// Mock the logger before requiring the module under test
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const { logger } = require('../src/utils/logger');
const { createGracefulShutdown, DEFAULT_SHUTDOWN_TIMEOUT_MS } = require('../src/utils/gracefulShutdown');

// Spy on process.exit to prevent actually exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

describe('Graceful Shutdown', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      destroy: jest.fn().mockResolvedValue(undefined)
    };
    jest.clearAllMocks();
  });

  describe('createGracefulShutdown', () => {
    it('should return shutdown and isInProgress functions', () => {
      const result = createGracefulShutdown(mockDb);
      expect(typeof result.shutdown).toBe('function');
      expect(typeof result.isInProgress).toBe('function');
    });

    it('should default to 30000ms shutdown timeout', () => {
      expect(DEFAULT_SHUTDOWN_TIMEOUT_MS).toBe(30000);
    });

    it('should not be in progress initially', () => {
      const { isInProgress } = createGracefulShutdown(mockDb);
      expect(isInProgress()).toBe(false);
    });
  });

  describe('shutdown behavior', () => {
    it('should close the server and database on SIGTERM', (done) => {
      const app = express();
      app.get('/health', (req, res) => res.json({ status: 'ok' }));

      const testServer = app.listen(0, () => {
        const { shutdown } = createGracefulShutdown(mockDb);

        shutdown(testServer, 'SIGTERM');

        setTimeout(() => {
          const infoCalls = logger.info.mock.calls.map(call => call[0]);

          const initiatedLog = infoCalls.find(c => c.type === 'SHUTDOWN' && c.action === 'initiated');
          expect(initiatedLog).toBeDefined();
          expect(initiatedLog.signal).toBe('SIGTERM');

          const drainedLog = infoCalls.find(c => c.type === 'SHUTDOWN' && c.action === 'connections_drained');
          expect(drainedLog).toBeDefined();

          const dbClosedLog = infoCalls.find(c => c.type === 'SHUTDOWN' && c.action === 'db_closed');
          expect(dbClosedLog).toBeDefined();

          const completeLog = infoCalls.find(c => c.type === 'SHUTDOWN' && c.action === 'complete');
          expect(completeLog).toBeDefined();

          expect(mockDb.destroy).toHaveBeenCalled();
          expect(mockExit).toHaveBeenCalledWith(0);

          done();
        }, 200);
      });
    });

    it('should handle SIGINT signal', (done) => {
      const app = express();
      const testServer = app.listen(0, () => {
        const { shutdown } = createGracefulShutdown(mockDb);

        shutdown(testServer, 'SIGINT');

        setTimeout(() => {
          const infoCalls = logger.info.mock.calls.map(call => call[0]);
          const initiatedLog = infoCalls.find(c => c.type === 'SHUTDOWN' && c.action === 'initiated');
          expect(initiatedLog).toBeDefined();
          expect(initiatedLog.signal).toBe('SIGINT');

          done();
        }, 200);
      });
    });

    it('should log db_close_error when db.destroy fails', (done) => {
      mockDb.destroy.mockRejectedValueOnce(new Error('DB connection error'));

      const app = express();
      const testServer = app.listen(0, () => {
        const { shutdown } = createGracefulShutdown(mockDb);

        shutdown(testServer, 'SIGTERM');

        setTimeout(() => {
          const errorCalls = logger.error.mock.calls.map(call => call[0]);
          const dbErrorLog = errorCalls.find(c => c.type === 'SHUTDOWN' && c.action === 'db_close_error');
          expect(dbErrorLog).toBeDefined();
          expect(dbErrorLog.error).toBe('DB connection error');

          done();
        }, 200);
      });
    });

    it('should mark shutdown as in progress', (done) => {
      const app = express();
      const testServer = app.listen(0, () => {
        const { shutdown, isInProgress } = createGracefulShutdown(mockDb);

        expect(isInProgress()).toBe(false);
        shutdown(testServer, 'SIGTERM');
        expect(isInProgress()).toBe(true);

        setTimeout(() => {
          done();
        }, 200);
      });
    });

    it('should ignore duplicate shutdown calls', (done) => {
      const app = express();
      const testServer = app.listen(0, () => {
        const { shutdown } = createGracefulShutdown(mockDb);

        shutdown(testServer, 'SIGTERM');
        shutdown(testServer, 'SIGTERM'); // Second call should be ignored

        setTimeout(() => {
          const infoCalls = logger.info.mock.calls.map(call => call[0]);
          const initiatedLogs = infoCalls.filter(c => c.type === 'SHUTDOWN' && c.action === 'initiated');
          expect(initiatedLogs).toHaveLength(1);

          done();
        }, 200);
      });
    });

    it('should accept custom timeout via options', (done) => {
      const app = express();
      const testServer = app.listen(0, () => {
        const { shutdown } = createGracefulShutdown(mockDb, { timeoutMs: 5000 });

        shutdown(testServer, 'SIGTERM');

        setTimeout(() => {
          expect(mockExit).toHaveBeenCalledWith(0);
          done();
        }, 200);
      });
    });
  });

  describe('Server draining behavior', () => {
    it('should stop accepting new connections during shutdown', (done) => {
      const app = express();
      app.get('/slow', (req, res) => {
        setTimeout(() => res.json({ ok: true }), 100);
      });

      const testServer = app.listen(0, () => {
        const port = testServer.address().port;
        const { shutdown } = createGracefulShutdown(mockDb);

        shutdown(testServer, 'SIGTERM');

        // Attempt a new connection after shutdown initiated — should fail
        const req = http.get(`http://localhost:${port}/slow`, () => {
          done(new Error('Should not have received a response'));
        });

        req.on('error', () => {
          // Expected: connection refused or reset
          done();
        });
      });
    });

    it('should complete in-flight requests before closing', (done) => {
      const app = express();
      let requestCompleted = false;

      app.get('/slow', (req, res) => {
        setTimeout(() => {
          requestCompleted = true;
          res.json({ ok: true });
        }, 50);
      });

      const testServer = app.listen(0, () => {
        const port = testServer.address().port;
        const { shutdown } = createGracefulShutdown(mockDb);

        // Start a request before shutdown
        http.get(`http://localhost:${port}/slow`, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            expect(requestCompleted).toBe(true);
            expect(JSON.parse(data)).toEqual({ ok: true });
            done();
          });
        });

        // Initiate shutdown slightly after request starts
        setTimeout(() => {
          shutdown(testServer, 'SIGTERM');
        }, 10);
      });
    });
  });
});
