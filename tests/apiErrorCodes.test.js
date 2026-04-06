/**
 * Tests for Issue #83: API returns 200 for failed operations
 *
 * Verifies that API endpoints return appropriate error codes (400, 404, 500)
 * for different failure modes instead of always returning 200.
 */

const { AppError, ErrorCodes, formatErrorResponse, sanitizePatientError } = require('../src/utils/errorCodes');

// ---- Mock db ----
jest.mock('../src/models/db', () => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  };
  const db = jest.fn(() => mockQuery);
  db._mockQuery = mockQuery;
  return db;
});

// ---- Mock providerPatientService ----
jest.mock('../src/services/providerPatientService', () => ({
  verifyAccess: jest.fn().mockResolvedValue(true),
}));

// ---- Mock encryption ----
jest.mock('../src/utils/encryption', () => ({
  encrypt: jest.fn(v => `enc_${v}`),
  decrypt: jest.fn(v => v ? v.replace('enc_', '') : null),
}));

// ---- Mock imageAttachmentService ----
jest.mock('../src/services/imageAttachmentService', () => ({
  upload: jest.fn(),
  listByRecord: jest.fn().mockResolvedValue([]),
}));

const db = require('../src/models/db');
const ProviderPatientService = require('../src/services/providerPatientService');
const PatientService = require('../src/services/patientService');
const RecordService = require('../src/services/recordService');

describe('Issue #83: API returns appropriate error codes for failed operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const q = db._mockQuery;
    q.where.mockReturnThis();
    q.first.mockReset();
    q.orderBy.mockReturnThis();
    q.limit.mockReturnThis();
    q.offset.mockReturnThis();
    q.count.mockReturnThis();
    q.select.mockReturnThis();
    q.leftJoin.mockReturnThis();
    q.returning.mockReset();
  });

  describe('PatientService.getById returns 404 for missing patients', () => {
    const user = { id: 1, role: 'provider', provider_id: 10 };

    it('should throw PATIENT_NOT_FOUND (404) when patient does not exist', async () => {
      db._mockQuery.first.mockResolvedValue(undefined);

      await expect(PatientService.getById(999, user))
        .rejects
        .toThrow(AppError);

      try {
        await PatientService.getById(999, user);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe(ErrorCodes.PATIENT_NOT_FOUND);
        expect(err.status).toBe(404);
        expect(err.message).toBe('Patient not found');
      }
    });

    it('should return patient data when patient exists', async () => {
      db._mockQuery.first.mockResolvedValue({
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        ssn_encrypted: 'enc_123-45-6789',
      });

      const patient = await PatientService.getById(1, user);

      expect(patient).toBeDefined();
      expect(patient.id).toBe(1);
      expect(patient.ssn).toBe('123-45-6789');
    });

    it('should produce a 404 response when formatted through sanitizePatientError', async () => {
      const err = new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
      const { status, body } = sanitizePatientError(err);

      expect(status).toBe(404);
      expect(body.error.code).toBe('PATIENT_NOT_FOUND');
    });
  });

  describe('RecordService.getByPatient properly handles errors in try-catch', () => {
    const user = { id: 1, role: 'provider', provider_id: 10 };

    it('should propagate access denied errors with proper status', async () => {
      ProviderPatientService.verifyAccess.mockRejectedValue(
        new AppError(ErrorCodes.ACCESS_DENIED, 'Not authorized to access this patient')
      );

      await expect(RecordService.getByPatient('patient-1', user))
        .rejects
        .toThrow(AppError);

      try {
        await RecordService.getByPatient('patient-1', user);
      } catch (err) {
        expect(err.code).toBe(ErrorCodes.ACCESS_DENIED);
        expect(err.status).toBe(403);
      }
    });

    it('should format access denied error as 403 through formatErrorResponse', () => {
      const err = new AppError(ErrorCodes.ACCESS_DENIED, 'Not authorized');
      const { status, body } = formatErrorResponse(err);

      expect(status).toBe(403);
      expect(body.error.code).toBe('ACCESS_DENIED');
    });

    it('should return paginated results when successful', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      const mockRecords = [{ id: 'rec-1', patient_id: 'p1' }];
      db.mockImplementation(() => {
        const chain = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue(mockRecords),
          count: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ total: 1 }),
          select: jest.fn().mockReturnThis(),
        };
        return chain;
      });

      const result = await RecordService.getByPatient('p1', user);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('Auth module loads without syntax errors', () => {
    it('should export auth middleware as a function', () => {
      // This test verifies the duplicate const token declaration is fixed
      // If not fixed, requiring the module would throw a SyntaxError
      const auth = require('../src/api/auth');
      expect(auth).toBeDefined();
    });

    it('should export generateToken from auth middleware', () => {
      const { generateToken } = require('../src/middleware/auth');
      expect(typeof generateToken).toBe('function');
    });
  });

  describe('Error response formatting for different failure modes', () => {
    it('should return 400 for validation errors', () => {
      const err = new AppError(ErrorCodes.VALIDATION_FAILED, 'Invalid input');
      const { status, body } = formatErrorResponse(err);

      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('should return 404 for not-found errors', () => {
      const err = new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
      const { status, body } = formatErrorResponse(err);

      expect(status).toBe(404);
      expect(body.error.code).toBe('RECORD_NOT_FOUND');
    });

    it('should return 500 for internal errors', () => {
      const err = new Error('Database connection failed');
      const { status, body } = formatErrorResponse(err);

      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should return 409 for conflict errors', () => {
      const err = new AppError(ErrorCodes.HOLIDAY_CONFLICT, 'Cannot book on holiday');
      const { status, body } = formatErrorResponse(err);

      expect(status).toBe(409);
      expect(body.error.code).toBe('HOLIDAY_CONFLICT');
    });

    it('should return 403 for authorization errors', () => {
      const err = new AppError(ErrorCodes.ACCESS_DENIED, 'Access denied');
      const { status, body } = formatErrorResponse(err);

      expect(status).toBe(403);
      expect(body.error.code).toBe('ACCESS_DENIED');
    });
  });
});
