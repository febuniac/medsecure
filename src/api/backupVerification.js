const express = require('express');
const router = express.Router();
const {
  runVerificationNow,
  getLastVerificationResult,
  getVerificationHistory
} = require('../services/backupVerificationScheduler');
const db = require('../models/db');
const knex = require('knex');
const { buildTestDbConfig } = require('../config/database');
const { ErrorCodes, formatError } = require('../utils/errorCodes');

function getTestDb() {
  return knex(buildTestDbConfig());
}

router.get('/status', (req, res) => {
  const lastResult = getLastVerificationResult();
  if (!lastResult) {
    return res.json({
      message: 'No backup verification has been run yet',
      lastVerification: null
    });
  }
  res.json({ lastVerification: lastResult });
});

router.get('/history', (req, res) => {
  const history = getVerificationHistory();
  res.json({
    total: history.length,
    verifications: history
  });
});

router.post('/run', async (req, res) => {
  try {
    const testDb = getTestDb();
    const result = await runVerificationNow(db, testDb);
    await testDb.destroy();

    const statusCode = result.status === 'passed' ? 200 : 500;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      ...formatError(ErrorCodes.INTERNAL_ERROR, error.message)
    });
  }
});

module.exports = router;
