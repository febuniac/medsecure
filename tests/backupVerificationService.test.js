const { BackupVerificationService, CRITICAL_TABLES } = require('../src/services/backupVerificationService');

function createMockDb(tableData = {}) {
  const db = jest.fn((tableName) => {
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
  return db;
}

describe('BackupVerificationService', () => {
  describe('CRITICAL_TABLES', () => {
    it('should include all required healthcare tables', () => {
      expect(CRITICAL_TABLES).toContain('patients');
      expect(CRITICAL_TABLES).toContain('medical_records');
      expect(CRITICAL_TABLES).toContain('appointments');
      expect(CRITICAL_TABLES).toContain('prescriptions');
      expect(CRITICAL_TABLES).toContain('consent_records');
      expect(CRITICAL_TABLES).toContain('audit_logs');
    });
  });

  describe('getTableRowCounts', () => {
    it('should return row counts for all critical tables', async () => {
      const tableData = {
        patients: [{ id: 1 }, { id: 2 }, { id: 3 }],
        medical_records: [{ id: 1 }],
        appointments: [{ id: 1 }, { id: 2 }],
        prescriptions: [],
        consent_records: [{ id: 1 }],
        audit_logs: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
      };
      const mockDb = createMockDb(tableData);
      const service = new BackupVerificationService(mockDb, mockDb);

      const counts = await service.getTableRowCounts(mockDb);

      expect(counts.patients).toBe(3);
      expect(counts.medical_records).toBe(1);
      expect(counts.appointments).toBe(2);
      expect(counts.prescriptions).toBe(0);
      expect(counts.consent_records).toBe(1);
      expect(counts.audit_logs).toBe(4);
    });
  });

  describe('validateRowCounts', () => {
    it('should pass when all row counts match', async () => {
      const tableData = {
        patients: [{ id: 1 }, { id: 2 }],
        medical_records: [{ id: 1 }],
        appointments: [],
        prescriptions: [{ id: 1 }],
        consent_records: [],
        audit_logs: [{ id: 1 }]
      };
      const mockTestDb = createMockDb(tableData);
      const service = new BackupVerificationService(null, mockTestDb);

      const expectedCounts = {
        patients: 2,
        medical_records: 1,
        appointments: 0,
        prescriptions: 1,
        consent_records: 0,
        audit_logs: 1
      };

      const { allPassed, results } = await service.validateRowCounts(expectedCounts);

      expect(allPassed).toBe(true);
      expect(results).toHaveLength(CRITICAL_TABLES.length);
      results.forEach(result => {
        expect(result.passed).toBe(true);
        expect(result.discrepancy).toBe(0);
      });
    });

    it('should fail when row counts do not match', async () => {
      const tableData = {
        patients: [{ id: 1 }],
        medical_records: [{ id: 1 }],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockTestDb = createMockDb(tableData);
      const service = new BackupVerificationService(null, mockTestDb);

      const expectedCounts = {
        patients: 5,
        medical_records: 1,
        appointments: 0,
        prescriptions: 0,
        consent_records: 0,
        audit_logs: 0
      };

      const { allPassed, results } = await service.validateRowCounts(expectedCounts);

      expect(allPassed).toBe(false);
      const patientsResult = results.find(r => r.table === 'patients');
      expect(patientsResult.passed).toBe(false);
      expect(patientsResult.expectedRows).toBe(5);
      expect(patientsResult.actualRows).toBe(1);
      expect(patientsResult.discrepancy).toBe(-4);
    });

    it('should report discrepancy details for each table', async () => {
      const tableData = {
        patients: [{ id: 1 }, { id: 2 }, { id: 3 }],
        medical_records: [],
        appointments: [{ id: 1 }],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockTestDb = createMockDb(tableData);
      const service = new BackupVerificationService(null, mockTestDb);

      const expectedCounts = {
        patients: 2,
        medical_records: 3,
        appointments: 1,
        prescriptions: 0,
        consent_records: 0,
        audit_logs: 0
      };

      const { allPassed, results } = await service.validateRowCounts(expectedCounts);

      expect(allPassed).toBe(false);

      const patientsResult = results.find(r => r.table === 'patients');
      expect(patientsResult.discrepancy).toBe(1);
      expect(patientsResult.passed).toBe(false);

      const recordsResult = results.find(r => r.table === 'medical_records');
      expect(recordsResult.discrepancy).toBe(-3);
      expect(recordsResult.passed).toBe(false);

      const appointmentsResult = results.find(r => r.table === 'appointments');
      expect(appointmentsResult.passed).toBe(true);
    });
  });

  describe('verifyBackup', () => {
    it('should return passed status when all tables match', async () => {
      const tableData = {
        patients: [{ id: 1 }, { id: 2 }],
        medical_records: [{ id: 1 }],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: [{ id: 1 }]
      };
      const mockSourceDb = createMockDb(tableData);
      const mockTestDb = createMockDb(tableData);
      const service = new BackupVerificationService(mockSourceDb, mockTestDb);

      const result = await service.verifyBackup('/backups/test.sql');

      expect(result.status).toBe('passed');
      expect(result.allPassed).toBe(true);
      expect(result.tables).toHaveLength(CRITICAL_TABLES.length);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeNull();
      expect(result.backupPath).toBe('/backups/test.sql');
    });

    it('should return failed status when tables have mismatched counts', async () => {
      const sourceData = {
        patients: [{ id: 1 }, { id: 2 }, { id: 3 }],
        medical_records: [{ id: 1 }],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const testData = {
        patients: [{ id: 1 }],
        medical_records: [{ id: 1 }],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockSourceDb = createMockDb(sourceData);
      const mockTestDb = createMockDb(testData);
      const service = new BackupVerificationService(mockSourceDb, mockTestDb);

      const result = await service.verifyBackup('/backups/test.sql');

      expect(result.status).toBe('failed');
      expect(result.allPassed).toBe(false);
      const failedTables = result.tables.filter(t => !t.passed);
      expect(failedTables.length).toBeGreaterThan(0);
    });

    it('should return error status when an exception occurs', async () => {
      const mockSourceDb = jest.fn(() => {
        throw new Error('Connection refused');
      });
      const mockTestDb = createMockDb({});
      const service = new BackupVerificationService(mockSourceDb, mockTestDb);

      const result = await service.verifyBackup('/backups/test.sql');

      expect(result.status).toBe('error');
      expect(result.error).toBe('Connection refused');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include timing information', async () => {
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
      const service = new BackupVerificationService(mockSourceDb, mockTestDb);

      const result = await service.verifyBackup('/backups/test.sql');

      expect(result.startedAt).toBeDefined();
      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('restoreBackupToTestDb', () => {
    it('should clear test db tables before restore', async () => {
      const sourceData = {
        patients: [{ id: 1, name: 'Test' }],
        medical_records: [],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockSourceDb = createMockDb(sourceData);
      const delMock = jest.fn().mockResolvedValue(0);
      const insertMock = jest.fn().mockResolvedValue([]);
      const mockTestDb = jest.fn(() => ({
        count: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ count: '0' })
        }),
        select: jest.fn().mockResolvedValue([]),
        del: delMock,
        insert: insertMock
      }));

      const service = new BackupVerificationService(mockSourceDb, mockTestDb);
      await service.restoreBackupToTestDb('/backups/test.sql');

      expect(delMock).toHaveBeenCalled();
    });

    it('should copy rows from source to test database', async () => {
      const sourceData = {
        patients: [{ id: 1, name: 'Patient A' }, { id: 2, name: 'Patient B' }],
        medical_records: [],
        appointments: [],
        prescriptions: [],
        consent_records: [],
        audit_logs: []
      };
      const mockSourceDb = createMockDb(sourceData);
      const insertMock = jest.fn().mockResolvedValue([]);
      const mockTestDb = jest.fn(() => ({
        count: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ count: '0' })
        }),
        select: jest.fn().mockResolvedValue([]),
        del: jest.fn().mockResolvedValue(0),
        insert: insertMock
      }));

      const service = new BackupVerificationService(mockSourceDb, mockTestDb);
      await service.restoreBackupToTestDb('/backups/test.sql');

      expect(insertMock).toHaveBeenCalled();
    });
  });
});
