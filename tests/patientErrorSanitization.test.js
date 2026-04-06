const express = require('express');
const request = require('supertest');
const { AppError, ErrorCodes, sanitizePatientError } = require('../src/utils/errorCodes');

// Mock dependencies
jest.mock('../src/services/patientService', () => ({
  getById: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../src/services/patientExportService', () => ({
  exportPatientData: jest.fn(),
}));

const PatientService = require('../src/services/patientService');
const PatientExportService = require('../src/services/patientExportService');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 1, role: 'admin', provider_id: 10 };
    next();
  });
  const patientRouter = require('../src/api/patients');
  app.use('/patients', patientRouter);
  return app;
}

describe('sanitizePatientError', () => {
  it('should return structured response for AppError instances', () => {
    const err = new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
    const { status, body } = sanitizePatientError(err);
    expect(status).toBe(404);
    expect(body.error.code).toBe('PATIENT_NOT_FOUND');
    expect(body.error.message).toBe('Patient not found');
  });

  it('should return structured response for AppError with details', () => {
    const err = new AppError(ErrorCodes.VALIDATION_FAILED, 'Bad input', {
      details: ['name is required'],
    });
    const { status, body } = sanitizePatientError(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual(['name is required']);
  });

  it('should handle legacy errors with .code and .status', () => {
    const err = new Error('Access denied');
    err.code = ErrorCodes.ACCESS_DENIED;
    err.status = 403;
    const { status, body } = sanitizePatientError(err);
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCESS_DENIED');
    expect(body.error.message).toBe('Access denied');
  });

  it('should return generic message for unstructured errors', () => {
    const err = new Error('DB error: patient SSN=123-45-6789, name=John Doe');
    const { status, body } = sanitizePatientError(err);
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Failed to process patient record');
  });

  it('should NOT leak patient data in error message for plain errors', () => {
    const patientData = { id: 1, first_name: 'Jane', ssn: '987-65-4321' };
    const err = new Error(`Failed to update patient: ${JSON.stringify(patientData)}`);
    const { status, body } = sanitizePatientError(err);
    expect(status).toBe(500);
    expect(body.error.message).toBe('Failed to process patient record');
    expect(body.error.message).not.toContain('Jane');
    expect(body.error.message).not.toContain('987-65-4321');
    expect(JSON.stringify(body)).not.toContain('Jane');
    expect(JSON.stringify(body)).not.toContain('987-65-4321');
  });

  it('should NOT leak error details for unstructured errors', () => {
    const err = new Error('something broke');
    err.status = 502;
    const { status, body } = sanitizePatientError(err);
    expect(status).toBe(500);
    expect(body.error.message).toBe('Failed to process patient record');
  });
});

describe('Patient API error sanitization', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /patients', () => {
    it('should return generic error when list throws unstructured error', async () => {
      PatientService.list.mockRejectedValue(
        new Error('SELECT * FROM patients WHERE ssn=123-45-6789 failed')
      );
      const res = await request(app).get('/patients');
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Failed to process patient record');
      expect(JSON.stringify(res.body)).not.toContain('123-45-6789');
    });

    it('should preserve AppError details for known errors', async () => {
      PatientService.list.mockRejectedValue(
        new AppError(ErrorCodes.ACCESS_DENIED, 'Access denied')
      );
      const res = await request(app).get('/patients');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCESS_DENIED');
    });
  });

  describe('GET /patients/:id', () => {
    it('should return generic error when getById throws unstructured error', async () => {
      PatientService.getById.mockRejectedValue(
        new Error('patient {id:1, name:"John Doe", ssn:"111-22-3333"} not processable')
      );
      const res = await request(app).get('/patients/1');
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Failed to process patient record');
      expect(JSON.stringify(res.body)).not.toContain('John Doe');
      expect(JSON.stringify(res.body)).not.toContain('111-22-3333');
    });

    it('should preserve PATIENT_NOT_FOUND AppError', async () => {
      PatientService.getById.mockRejectedValue(
        new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found')
      );
      const res = await request(app).get('/patients/999');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
  });

  describe('POST /patients', () => {
    it('should return generic error when create throws unstructured error', async () => {
      PatientService.create.mockRejectedValue(
        new Error('duplicate key: email=patient@example.com')
      );
      const res = await request(app).post('/patients').send({ first_name: 'Test' });
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Failed to process patient record');
      expect(JSON.stringify(res.body)).not.toContain('patient@example.com');
    });
  });

  describe('PUT /patients/:id', () => {
    it('should return generic error when update throws unstructured error', async () => {
      PatientService.update.mockRejectedValue(
        new Error('constraint violation for patient row {ssn: "444-55-6666"}')
      );
      const res = await request(app).put('/patients/1').send({ first_name: 'Updated' });
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Failed to process patient record');
      expect(JSON.stringify(res.body)).not.toContain('444-55-6666');
    });

    it('should preserve AppError for PATIENT_NOT_FOUND on update', async () => {
      PatientService.update.mockRejectedValue(
        new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found')
      );
      const res = await request(app).put('/patients/999').send({ first_name: 'Updated' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
  });

  describe('GET /patients/:id/export', () => {
    it('should return generic error when export throws unstructured error', async () => {
      PatientExportService.exportPatientData.mockRejectedValue(
        new Error('failed to export: patient DOB=1990-01-01, MRN=ABC123')
      );
      const res = await request(app).get('/patients/1/export');
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Failed to process patient record');
      expect(JSON.stringify(res.body)).not.toContain('1990-01-01');
      expect(JSON.stringify(res.body)).not.toContain('ABC123');
    });

    it('should preserve PATIENT_NOT_FOUND AppError for export', async () => {
      PatientExportService.exportPatientData.mockRejectedValue(
        new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found')
      );
      const res = await request(app).get('/patients/999/export');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
  });
});
