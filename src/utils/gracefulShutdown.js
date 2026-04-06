const { logger } = require('./logger');

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30000;

function createGracefulShutdown(db, options = {}) {
  const timeoutMs = options.timeoutMs || parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let isShuttingDown = false;

  function shutdown(server, signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ type: 'SHUTDOWN', action: 'initiated', signal, message: 'Graceful shutdown started, draining active connections...' });

    // Stop accepting new connections and drain existing ones
    server.close(async () => {
      logger.info({ type: 'SHUTDOWN', action: 'connections_drained', message: 'All active connections have been closed' });

      try {
        await db.destroy();
        logger.info({ type: 'SHUTDOWN', action: 'db_closed', message: 'Database connection pool closed' });
      } catch (err) {
        logger.error({ type: 'SHUTDOWN', action: 'db_close_error', error: err.message });
      }

      logger.info({ type: 'SHUTDOWN', action: 'complete', message: 'Graceful shutdown complete' });
      process.exit(0);
    });

    // Force shutdown if draining takes too long
    const forceShutdownTimer = setTimeout(() => {
      logger.error({ type: 'SHUTDOWN', action: 'forced', message: `Forcing shutdown after ${timeoutMs}ms timeout` });
      process.exit(1);
    }, timeoutMs);

    // Allow the process to exit naturally if the timer is the only thing keeping it alive
    if (forceShutdownTimer.unref) {
      forceShutdownTimer.unref();
    }
  }

  function isInProgress() {
    return isShuttingDown;
  }

  return { shutdown, isInProgress };
}

module.exports = { createGracefulShutdown, DEFAULT_SHUTDOWN_TIMEOUT_MS };
