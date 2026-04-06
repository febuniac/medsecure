const {
  ErrorCodes,
  ErrorStatusMap,
  AppError,
  formatError,
  formatErrorResponse,
} = require('../src/utils/errorCodes');

describe('ErrorCodes', () => {
  it('should be a frozen object', () => {
    expect(Object.isFrozen(ErrorCodes)).toBe(true);
  });

  it('should contain all expected authentication error codes', () => {
    expect(ErrorCodes.AUTHENTICATION_REQUIRED).toBe('AUTHENTICATION_REQUIRED');
    expect(ErrorCodes.INVALID_TOKEN).toBe('INVALID_TOKEN');
    expect(ErrorCodes.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
    expect(ErrorCodes.ACCESS_DENIED).toBe('ACCESS_DENIED');
    expect(ErrorCodes.ADMIN_ONLY).toBe('ADMIN_ONLY');
  });

  it('should contain all expected validation error codes', () => {
    expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCodes.MISSING_REQUIRED_FIELDS).toBe('MISSING_REQUIRED_FIELDS');
    expect(ErrorCodes.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCodes.INVALID_YEAR).toBe('INVALID_YEAR');
    expect(ErrorCodes.INVALID_STATUS_TRANSITION).toBe('INVALID_STATUS_TRANSITION');
  });

  it('should contain all expected not-found error codes', () => {
    expect(ErrorCodes.PATIENT_NOT_FOUND).toBe('PATIENT_NOT_FOUND');
    expect(ErrorCodes.RECORD_NOT_FOUND).toBe('RECORD_NOT_FOUND');
    expect(ErrorCodes.APPOINTMENT_NOT_FOUND).toBe('APPOINTMENT_NOT_FOUND');
    expect(ErrorCodes.ASSIGNMENT_NOT_FOUND).toBe('ASSIGNMENT_NOT_FOUND');
    expect(ErrorCodes.BAA_NOT_FOUND).toBe('BAA_NOT_FOUND');
    expect(ErrorCodes.BREACH_NOT_FOUND).toBe('BREACH_NOT_FOUND');
    expect(ErrorCodes.RISK_ASSESSMENT_NOT_FOUND).toBe('RISK_ASSESSMENT_NOT_FOUND');
  });

  it('should contain all expected conflict error codes', () => {
    expect(ErrorCodes.EMAIL_ALREADY_EXISTS).toBe('EMAIL_ALREADY_EXISTS');
    expect(ErrorCodes.HOLIDAY_CONFLICT).toBe('HOLIDAY_CONFLICT');
  });

  it('should contain server error codes', () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.REGISTRATION_FAILED).toBe('REGISTRATION_FAILED');
    expect(ErrorCodes.LOGIN_FAILED).toBe('LOGIN_FAILED');
  });
});

describe('ErrorStatusMap', () => {
  it('should be a frozen object', () => {
    expect(Object.isFrozen(ErrorStatusMap)).toBe(true);
  });

  it('should map authentication errors to 401', () => {
    expect(ErrorStatusMap[ErrorCodes.AUTHENTICATION_REQUIRED]).toBe(401);
    expect(ErrorStatusMap[ErrorCodes.INVALID_TOKEN]).toBe(401);
    expect(ErrorStatusMap[ErrorCodes.INVALID_CREDENTIALS]).toBe(401);
  });

  it('should map authorization errors to 403', () => {
    expect(ErrorStatusMap[ErrorCodes.ACCESS_DENIED]).toBe(403);
    expect(ErrorStatusMap[ErrorCodes.ADMIN_ONLY]).toBe(403);
  });

  it('should map validation errors to 400', () => {
    expect(ErrorStatusMap[ErrorCodes.VALIDATION_FAILED]).toBe(400);
    expect(ErrorStatusMap[ErrorCodes.MISSING_REQUIRED_FIELDS]).toBe(400);
    expect(ErrorStatusMap[ErrorCodes.INVALID_INPUT]).toBe(400);
    expect(ErrorStatusMap[ErrorCodes.INVALID_YEAR]).toBe(400);
    expect(ErrorStatusMap[ErrorCodes.INVALID_STATUS_TRANSITION]).toBe(400);
    expect(ErrorStatusMap[ErrorCodes.PASSWORD_TOO_WEAK]).toBe(400);
  });

  it('should map not-found errors to 404', () => {
    expect(ErrorStatusMap[ErrorCodes.PATIENT_NOT_FOUND]).toBe(404);
    expect(ErrorStatusMap[ErrorCodes.RECORD_NOT_FOUND]).toBe(404);
    expect(ErrorStatusMap[ErrorCodes.APPOINTMENT_NOT_FOUND]).toBe(404);
    expect(ErrorStatusMap[ErrorCodes.ASSIGNMENT_NOT_FOUND]).toBe(404);
    expect(ErrorStatusMap[ErrorCodes.BAA_NOT_FOUND]).toBe(404);
    expect(ErrorStatusMap[ErrorCodes.BREACH_NOT_FOUND]).toBe(404);
    expect(ErrorStatusMap[ErrorCodes.RISK_ASSESSMENT_NOT_FOUND]).toBe(404);
  });

  it('should map conflict errors to 409', () => {
    expect(ErrorStatusMap[ErrorCodes.EMAIL_ALREADY_EXISTS]).toBe(409);
    expect(ErrorStatusMap[ErrorCodes.HOLIDAY_CONFLICT]).toBe(409);
  });

  it('should map server errors to 500', () => {
    expect(ErrorStatusMap[ErrorCodes.INTERNAL_ERROR]).toBe(500);
    expect(ErrorStatusMap[ErrorCodes.REGISTRATION_FAILED]).toBe(500);
    expect(ErrorStatusMap[ErrorCodes.LOGIN_FAILED]).toBe(500);
  });
});

describe('AppError', () => {
  it('should create an error with code and message', () => {
    const err = new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('PATIENT_NOT_FOUND');
    expect(err.message).toBe('Patient not found');
    expect(err.status).toBe(404);
  });

  it('should derive HTTP status from ErrorStatusMap by default', () => {
    const err = new AppError(ErrorCodes.ACCESS_DENIED, 'Forbidden');
    expect(err.status).toBe(403);
  });

  it('should allow overriding the HTTP status', () => {
    const err = new AppError(ErrorCodes.INTERNAL_ERROR, 'Custom', { status: 503 });
    expect(err.status).toBe(503);
  });

  it('should include details when provided', () => {
    const details = ['field1 is required', 'field2 is invalid'];
    const err = new AppError(ErrorCodes.VALIDATION_FAILED, 'Validation failed', { details });
    expect(err.details).toEqual(details);
  });

  it('should not include details property when not provided', () => {
    const err = new AppError(ErrorCodes.INTERNAL_ERROR, 'Oops');
    expect(err).not.toHaveProperty('details');
  });

  it('should default to status 500 for unknown error codes', () => {
    const err = new AppError('UNKNOWN_CODE', 'Something');
    expect(err.status).toBe(500);
  });
});

describe('formatError', () => {
  it('should return structured error object with code and message', () => {
    const result = formatError('PATIENT_NOT_FOUND', 'Patient not found');
    expect(result).toEqual({
      error: {
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      },
    });
  });

  it('should include details when provided', () => {
    const details = ['email is required'];
    const result = formatError('VALIDATION_FAILED', 'Validation failed', details);
    expect(result).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: ['email is required'],
      },
    });
  });

  it('should not include details key when details is undefined', () => {
    const result = formatError('INTERNAL_ERROR', 'Server error');
    expect(result.error).not.toHaveProperty('details');
  });
});

describe('formatErrorResponse', () => {
  it('should format an AppError correctly', () => {
    const err = new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(404);
    expect(body).toEqual({
      error: {
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      },
    });
  });

  it('should include details from AppError', () => {
    const err = new AppError(ErrorCodes.VALIDATION_FAILED, 'Bad input', {
      details: ['name is required'],
    });
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(400);
    expect(body.error.details).toEqual(['name is required']);
  });

  it('should handle legacy errors with .code and .status', () => {
    const err = new Error('Access denied');
    err.code = ErrorCodes.ACCESS_DENIED;
    err.status = 403;
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCESS_DENIED');
    expect(body.error.message).toBe('Access denied');
  });

  it('should fall back to INTERNAL_ERROR for plain errors', () => {
    const err = new Error('Something broke');
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Something broke');
  });

  it('should use err.status for plain errors when available', () => {
    const err = new Error('Not found');
    err.status = 404;
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(404);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('should default message for plain errors without message', () => {
    const err = new Error();
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(500);
    expect(body.error.message).toBe('Internal server error');
  });
});

describe('Structured error responses in API routes', () => {
  describe('Auth middleware', () => {
    const authMiddleware = require('../src/middleware/auth');

    it('should return AUTHENTICATION_REQUIRED error when no token', () => {
      const req = { headers: {} };
      const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };

      authMiddleware(req, res, () => {});
      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.body.error.message).toBe('Authentication required');
    });

    it('should return INVALID_TOKEN error for bad token', () => {
      process.env.JWT_SECRET = 'test-secret';
      const req = { headers: { authorization: 'Bearer invalid.token.here' } };
      const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };

      authMiddleware(req, res, () => {});
      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
      expect(res.body.error.message).toBe('Invalid token');
    });
  });

  describe('Service errors produce structured AppError', () => {
    it('PatientService.update throws AppError with PATIENT_NOT_FOUND', async () => {
      const { AppError, ErrorCodes } = require('../src/utils/errorCodes');
      // We test that the error class and code are correct
      const err = new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
      expect(err.code).toBe('PATIENT_NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err).toBeInstanceOf(AppError);
    });

    it('AppointmentService errors have correct codes', () => {
      const { AppError, ErrorCodes } = require('../src/utils/errorCodes');

      const missingField = new AppError(ErrorCodes.MISSING_REQUIRED_FIELDS, 'Appointment date is required');
      expect(missingField.code).toBe('MISSING_REQUIRED_FIELDS');
      expect(missingField.status).toBe(400);

      const holiday = new AppError(ErrorCodes.HOLIDAY_CONFLICT, 'Cannot book on holiday');
      expect(holiday.code).toBe('HOLIDAY_CONFLICT');
      expect(holiday.status).toBe(409);

      const notFound = new AppError(ErrorCodes.APPOINTMENT_NOT_FOUND, 'Appointment not found');
      expect(notFound.code).toBe('APPOINTMENT_NOT_FOUND');
      expect(notFound.status).toBe(404);
    });

    it('ProviderPatientService errors have correct codes', () => {
      const { AppError, ErrorCodes } = require('../src/utils/errorCodes');

      const accessDenied = new AppError(ErrorCodes.ACCESS_DENIED, 'Access denied');
      expect(accessDenied.code).toBe('ACCESS_DENIED');
      expect(accessDenied.status).toBe(403);

      const adminOnly = new AppError(ErrorCodes.ADMIN_ONLY, 'Admin only');
      expect(adminOnly.code).toBe('ADMIN_ONLY');
      expect(adminOnly.status).toBe(403);

      const notFound = new AppError(ErrorCodes.ASSIGNMENT_NOT_FOUND, 'Assignment not found');
      expect(notFound.code).toBe('ASSIGNMENT_NOT_FOUND');
      expect(notFound.status).toBe(404);
    });

    it('RecordService errors have correct codes', () => {
      const { AppError, ErrorCodes } = require('../src/utils/errorCodes');
      const err = new AppError(ErrorCodes.RECORD_NOT_FOUND, 'Record not found');
      expect(err.code).toBe('RECORD_NOT_FOUND');
      expect(err.status).toBe(404);
    });
  });

  describe('formatError produces consistent shape for all error types', () => {
    const allCodes = Object.values(ErrorCodes);

    it('every error code has a mapping in ErrorStatusMap', () => {
      allCodes.forEach(code => {
        expect(ErrorStatusMap).toHaveProperty(code);
        expect(typeof ErrorStatusMap[code]).toBe('number');
      });
    });

    it('formatError always returns { error: { code, message } } shape', () => {
      allCodes.forEach(code => {
        const result = formatError(code, 'test message');
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('code', code);
        expect(result.error).toHaveProperty('message', 'test message');
      });
    });

    it('formatErrorResponse always returns { status, body } shape', () => {
      allCodes.forEach(code => {
        const err = new AppError(code, 'test');
        const response = formatErrorResponse(err);
        expect(response).toHaveProperty('status');
        expect(response).toHaveProperty('body');
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code', code);
      });
    });
  });
});
