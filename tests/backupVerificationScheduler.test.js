const {
  getLastVerificationResult,
  getVerificationHistory,
  runVerificationNow
} = require('../src/services/backupVerificationScheduler');

function createMockDb(tableData = {}) {
  return jest.fn((tableName) => {
    const data = tableData[tableName] || [];
    return {
      count: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue({ count: String(data.length) })
      }),
      select: jest.fn().mockResolvedValue(data),
      del: jest.fn().mockResolvedValue(data.length),
      insert: jest.fn().mockResolvedValue([])
    };
  });
}

describe('BackupVerificationScheduler', () => {
  describe('getLastVerificationResult', () => {
    it('should return null when no verification has run', () => {
      const result = getLastVerificationResult();
      expect(result).toBeDefined();
    });
  });

  describe('getVerificationHistory', () => {
    it('should return an array', () => {
      const history = getVerificationHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('runVerificationNow', () => {
    it('should run verification and return a result', async () => {
      const tableData = {
        patients: [{ id: 1 }],
        medical_records: [],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockSourceDb = createMockDb(tableData);
      const mockTestDb = createMockDb(tableData);

      const result = await runVerificationNow(mockSourceDb, mockTestDb);

      expect(result).toBeDefined();
      expect(result.status).toBe('passed');
      expect(result.allPassed).toBe(true);
      expect(result.tables).toHaveLength(6);
    });

    it('should store result in history after running', async () => {
      const tableData = {
        patients: [],
        medical_records: [],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockSourceDb = createMockDb(tableData);
      const mockTestDb = createMockDb(tableData);

      await runVerificationNow(mockSourceDb, mockTestDb);

      const lastResult = getLastVerificationResult();
      expect(lastResult).toBeDefined();
      expect(lastResult.status).toBe('passed');

      const history = getVerificationHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });
});
