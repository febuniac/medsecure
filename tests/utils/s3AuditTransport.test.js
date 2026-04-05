const { S3AuditTransport } = require('../../src/utils/s3AuditTransport');
const { resetAuditBackupService } = require('../../src/services/auditBackupService');

// Mock the auditBackupService module
jest.mock('../../src/services/auditBackupService', () => {
  const mockLog = jest.fn().mockResolvedValue(undefined);
  const mockShutdown = jest.fn().mockResolvedValue(undefined);
  return {
    getAuditBackupService: jest.fn(() => ({
      log: mockLog,
      shutdown: mockShutdown,
    })),
    resetAuditBackupService: jest.fn(),
    _mockLog: mockLog,
  };
});

const { getAuditBackupService, _mockLog } = require('../../src/services/auditBackupService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('S3AuditTransport', () => {
  it('should forward HIPAA_AUDIT entries to the backup service', (done) => {
    const transport = new S3AuditTransport({ level: 'info' });
    const entry = { type: 'HIPAA_AUDIT', method: 'GET', path: '/api/patients', level: 'info', message: '' };

    transport.log(entry, () => {
      expect(_mockLog).toHaveBeenCalledTimes(1);
      expect(_mockLog).toHaveBeenCalledWith(entry);
      done();
    });
  });

  it('should NOT forward non-HIPAA_AUDIT entries', (done) => {
    const transport = new S3AuditTransport({ level: 'info' });
    const entry = { type: 'APPLICATION_LOG', message: 'Server started', level: 'info' };

    transport.log(entry, () => {
      expect(_mockLog).not.toHaveBeenCalled();
      done();
    });
  });

  it('should NOT forward entries without a type field', (done) => {
    const transport = new S3AuditTransport({ level: 'info' });
    const entry = { message: 'Random log', level: 'info' };

    transport.log(entry, () => {
      expect(_mockLog).not.toHaveBeenCalled();
      done();
    });
  });

  it('should handle callback when log promise rejects', (done) => {
    _mockLog.mockRejectedValueOnce(new Error('S3 error'));
    const transport = new S3AuditTransport({ level: 'info' });
    const entry = { type: 'HIPAA_AUDIT', method: 'GET', path: '/api/test', level: 'info', message: '' };

    transport.on('warn', () => {
      // Expected - error emitted as warn
    });

    transport.log(entry, () => {
      // Callback should still be invoked even on error
      done();
    });
  });
});
