const RecordService = require('../recordService');
const ProviderPatientService = require('../providerPatientService');
const db = require('../../models/db');

jest.mock('../../models/db', () => {
  const mKnex = jest.fn();
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
  });
  return mKnex;
});

jest.mock('../providerPatientService');

describe('RecordService', () => {
  const assignedUser = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
  const unassignedUser = { id: 'user-2', role: 'provider', provider_id: 'provider-2' };
  const adminUser = { id: 'admin-1', role: 'admin', provider_id: 'provider-admin' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getByPatient', () => {
    it('should return records when provider is assigned to patient', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockRecords = [{ id: 'rec-1', patient_id: 'patient-1' }];
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockRecords),
      };
      db.mockImplementation(() => mockQuery);

      const result = await RecordService.getByPatient('patient-1', assignedUser);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(assignedUser, 'patient-1');
      expect(result).toEqual(mockRecords);
    });

    it('should throw 403 when provider is not assigned to patient', async () => {
      const accessError = new Error('Access denied: provider not assigned to this patient');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      try {
        await RecordService.getByPatient('patient-1', unassignedUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toContain('Access denied');
      }
    });

    it('should allow admin to access any patient records', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      };
      db.mockImplementation(() => mockQuery);

      await RecordService.getByPatient('patient-1', adminUser);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(adminUser, 'patient-1');
    });
  });

  describe('getById', () => {
    it('should return a record when provider is assigned to the record patient', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => mockQuery);
      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      const result = await RecordService.getById('rec-1', assignedUser);

      expect(result).toEqual(mockRecord);
      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(assignedUser, 'patient-1');
    });

    it('should throw 404 when record does not exist', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => mockQuery);

      try {
        await RecordService.getById('non-existent', assignedUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toBe('Record not found');
      }
    });

    it('should throw 403 when provider is not assigned to the record patient', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => mockQuery);

      const accessError = new Error('Access denied: provider not assigned to this patient');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      try {
        await RecordService.getById('rec-1', unassignedUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });
  });

  describe('create', () => {
    it('should create a record when provider is assigned to the patient', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'rec-new', patient_id: 'patient-1' }]),
      };
      db.mockImplementation(() => mockQuery);

      const data = { patient_id: 'patient-1', type: 'visit_note', content: 'Patient visit' };
      const result = await RecordService.create(data, assignedUser);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(assignedUser, 'patient-1');
      expect(data.created_by).toBe('user-1');
      expect(result).toEqual([{ id: 'rec-new', patient_id: 'patient-1' }]);
    });

    it('should throw 403 when provider is not assigned to the patient', async () => {
      const accessError = new Error('Access denied: provider not assigned to this patient');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      const data = { patient_id: 'patient-1', type: 'visit_note' };

      try {
        await RecordService.create(data, unassignedUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });
  });
});
