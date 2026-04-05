const { logger } = require('./logger');

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error({ type: 'ENV_VALIDATION', action: 'failed', missing });
    throw new Error(message);
  }
  logger.info({ type: 'ENV_VALIDATION', action: 'passed' });
}

module.exports = { validateEnv, REQUIRED_ENV_VARS };
