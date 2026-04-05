const { AuditBackupService, resetAuditBackupService } = require('../../src/services/auditBackupService');

// Mock S3Client
const mockSend = jest.fn().mockResolvedValue({});

const createService = (overrides = {}) => {
  return new AuditBackupService({
    enabled: true,
    bucket: 'test-audit-bucket',
    prefix: 'test-audit',
    region: 'us-east-1',
    flushIntervalMs: 60000, // large interval so we control flushing manually
    maxBufferSize: 1000,
    s3Client: { send: mockSend },
    ...overrides,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  resetAuditBackupService();
});

describe('AuditBackupService', () => {
  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const service = createService();
      expect(service.bucket).toBe('test-audit-bucket');
      expect(service.prefix).toBe('test-audit');
      expect(service.region).toBe('us-east-1');
      expect(service.enabled).toBe(true);
    });

    it('should not start flush timer when disabled', () => {
      const service = createService({ enabled: false });
      expect(service._flushTimer).toBeNull();
    });
  });

  describe('log()', () => {
    it('should buffer audit entries when enabled', async () => {
      const service = createService();
      const entry = { type: 'HIPAA_AUDIT', method: 'GET', path: '/api/patients' };

      await service.log(entry);

      expect(service.getBufferSize()).toBe(1);
    });

    it('should enrich entries with backupTimestamp and integrityHash', async () => {
      const service = createService();
      const entry = { type: 'HIPAA_AUDIT', method: 'GET', path: '/api/patients' };

      await service.log(entry);

      const buffered = service._buffer[0];
      expect(buffered.backupTimestamp).toBeDefined();
      expect(buffered.integrityHash).toBeDefined();
      expect(typeof buffered.integrityHash).toBe('string');
      expect(buffered.integrityHash).toHaveLength(64); // SHA-256 hex length
    });

    it('should not buffer entries when disabled', async () => {
      const service = createService({ enabled: false });
      const entry = { type: 'HIPAA_AUDIT', method: 'GET', path: '/api/patients' };

      await service.log(entry);

      expect(service.getBufferSize()).toBe(0);
    });

    it('should auto-flush when buffer reaches maxBufferSize', async () => {
      const service = createService({ maxBufferSize: 2 });

      await service.log({ type: 'HIPAA_AUDIT', method: 'GET', path: '/1' });
      expect(mockSend).not.toHaveBeenCalled();

      await service.log({ type: 'HIPAA_AUDIT', method: 'GET', path: '/2' });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(service.getBufferSize()).toBe(0);
    });
  });

  describe('flush()', () => {
    it('should send buffered entries to S3 as JSONL', async () => {
      const service = createService();

      await service.log({ type: 'HIPAA_AUDIT', method: 'GET', path: '/api/patients' });
      await service.log({ type: 'HIPAA_AUDIT', method: 'POST', path: '/api/records' });

      await service.flush();

      expect(mockSend).toHaveBeenCalledTimes(1);

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('test-audit-bucket');
      expect(command.input.Key).toMatch(/^test-audit\/\d{4}\/\d{2}\/\d{2}\//);
      expect(command.input.Key).toMatch(/\.jsonl$/);
      expect(command.input.ContentType).toBe('application/x-ndjson');
      expect(command.input.ObjectLockMode).toBe('GOVERNANCE');
      expect(command.input.ObjectLockRetainUntilDate).toBeInstanceOf(Date);
      expect(command.input.ServerSideEncryption).toBe('aws:kms');
      expect(command.input.Metadata['entry-count']).toBe('2');
      expect(command.input.Metadata['source']).toBe('medsecure-hipaa-audit');

      // Verify body is valid JSONL
      const lines = command.input.Body.trim().split('\n');
      expect(lines).toHaveLength(2);
      const parsed0 = JSON.parse(lines[0]);
      expect(parsed0.method).toBe('GET');
      const parsed1 = JSON.parse(lines[1]);
      expect(parsed1.method).toBe('POST');
    });

    it('should not call S3 when buffer is empty', async () => {
      const service = createService();
      await service.flush();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should re-add entries to buffer on S3 failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 network error'));
      const service = createService();

      await service.log({ type: 'HIPAA_AUDIT', method: 'GET', path: '/api/patients' });

      await expect(service.flush()).rejects.toThrow('S3 network error');
      expect(service.getBufferSize()).toBe(1);
    });

    it('should set retention date 6 years in the future', async () => {
      const service = createService();
      await service.log({ type: 'HIPAA_AUDIT', method: 'GET', path: '/test' });
      await service.flush();

      const command = mockSend.mock.calls[0][0];
      const retentionDate = command.input.ObjectLockRetainUntilDate;
      const now = new Date();
      const sixYearsFromNow = new Date();
      sixYearsFromNow.setFullYear(sixYearsFromNow.getFullYear() + 6);

      // Should be within a few seconds of 6 years from now
      expect(retentionDate.getFullYear()).toBe(sixYearsFromNow.getFullYear());
    });
  });

  describe('_computeHash()', () => {
    it('should produce consistent hashes for the same input', () => {
      const service = createService();
      const entry = { type: 'HIPAA_AUDIT', method: 'GET', path: '/test' };

      const hash1 = service._computeHash(entry);
      const hash2 = service._computeHash(entry);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const service = createService();

      const hash1 = service._computeHash({ type: 'HIPAA_AUDIT', method: 'GET' });
      const hash2 = service._computeHash({ type: 'HIPAA_AUDIT', method: 'POST' });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('shutdown()', () => {
    it('should flush remaining entries and clear timer', async () => {
      const service = createService();
      await service.log({ type: 'HIPAA_AUDIT', method: 'GET', path: '/test' });

      await service.shutdown();

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(service._flushTimer).toBeNull();
      expect(service.getBufferSize()).toBe(0);
    });
  });
});
