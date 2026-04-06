const PrescriptionService = require('../src/services/prescriptionService');
const { AppError, ErrorCodes } = require('../src/utils/errorCodes');

// Mock the db module
jest.mock('../src/models/db', () => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
  };

  const db = jest.fn(() => mockQuery);
  db._mockQuery = mockQuery;
  db.raw = jest.fn((expr) => expr);
  return db;
});

// Mock ProviderPatientService
jest.mock('../src/services/providerPatientService', () => ({
  verifyAccess: jest.fn().mockResolvedValue(true),
}));

const db = require('../src/models/db');
const ProviderPatientService = require('../src/services/providerPatientService');

describe('PrescriptionService', () => {
  const user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    const q = db._mockQuery;
    q.where.mockReturnThis();
    q.whereIn.mockReturnThis();
    q.orWhere.mockReturnThis();
    q.orderBy.mockReturnThis();
    q.insert.mockReturnThis();
    q.update.mockReturnThis();
    q.first.mockReset();
    q.returning.mockReset();
  });

  describe('checkInteractions', () => {
    it('should return empty array when patient has no active prescriptions', async () => {
      db._mockQuery.where.mockResolvedValueOnce([]);

      const result = await PrescriptionService.checkInteractions('patient-1', 'Aspirin');

      expect(result).toEqual([]);
      expect(db).toHaveBeenCalledWith('prescriptions');
    });

    it('should return interactions when a conflict exists', async () => {
      const activePrescriptions = [
        { id: 'rx-1', patient_id: 'patient-1', drug_name: 'Warfarin', status: 'active' },
      ];
      const interactions = [
        { id: 'int-1', drug_a: 'Aspirin', drug_b: 'Warfarin', severity: 'major', description: 'Increased bleeding risk' },
      ];

      // First call: query active prescriptions
      db._mockQuery.where.mockResolvedValueOnce(activePrescriptions);
      // Second call chain: query drug_interactions (orWhere resolves)
      db._mockQuery.orWhere.mockResolvedValueOnce(interactions);

      const result = await PrescriptionService.checkInteractions('patient-1', 'Aspirin');

      expect(result).toEqual(interactions);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('major');
    });

    it('should return empty array when no interactions found', async () => {
      const activePrescriptions = [
        { id: 'rx-1', patient_id: 'patient-1', drug_name: 'Metformin', status: 'active' },
      ];

      db._mockQuery.where.mockResolvedValueOnce(activePrescriptions);
      db._mockQuery.orWhere.mockResolvedValueOnce([]);

      const result = await PrescriptionService.checkInteractions('patient-1', 'Lisinopril');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should throw MISSING_REQUIRED_FIELDS when drug_name is missing', async () => {
      const data = { patient_id: 'patient-1' };

      await expect(PrescriptionService.create(data, user))
        .rejects.toThrow('Drug name is required');
    });

    it('should throw DRUG_INTERACTION_FOUND when interactions exist', async () => {
      const data = { patient_id: 'patient-1', drug_name: 'Aspirin' };
      const activePrescriptions = [
        { id: 'rx-1', patient_id: 'patient-1', drug_name: 'Warfarin', status: 'active' },
      ];
      const interactions = [
        { id: 'int-1', drug_a: 'Aspirin', drug_b: 'Warfarin', severity: 'major', description: 'Increased bleeding risk' },
      ];

      db._mockQuery.where.mockResolvedValueOnce(activePrescriptions);
      db._mockQuery.orWhere.mockResolvedValueOnce(interactions);

      try {
        await PrescriptionService.create(data, user);
        throw new Error('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe(ErrorCodes.DRUG_INTERACTION_FOUND);
        expect(err.message).toContain('Aspirin');
        expect(err.message).toContain('Warfarin');
      }
    });

    it('should create prescription when no interactions are found', async () => {
      const data = { patient_id: 'patient-1', drug_name: 'Lisinopril', dosage: '10mg' };
      const createdPrescription = {
        id: 'rx-new',
        ...data,
        prescribed_by: user.id,
        status: 'active',
      };

      // checkInteractions: no active prescriptions
      db._mockQuery.where.mockResolvedValueOnce([]);
      // insert returning
      db._mockQuery.returning.mockResolvedValueOnce([createdPrescription]);

      const result = await PrescriptionService.create(data, user);

      expect(result).toEqual(createdPrescription);
      expect(result.prescribed_by).toBe(user.id);
      expect(result.status).toBe('active');
      expect(db._mockQuery.insert).toHaveBeenCalled();
    });

    it('should verify provider access before creating', async () => {
      const data = { patient_id: 'patient-1', drug_name: 'Metformin' };

      db._mockQuery.where.mockResolvedValueOnce([]);
      db._mockQuery.returning.mockResolvedValueOnce([{ id: 'rx-1', ...data }]);

      await PrescriptionService.create(data, user);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(user, 'patient-1');
    });

    it('should create prescription when interactions exist with other drugs only', async () => {
      const data = { patient_id: 'patient-1', drug_name: 'Metformin', dosage: '500mg' };
      const activePrescriptions = [
        { id: 'rx-1', patient_id: 'patient-1', drug_name: 'Lisinopril', status: 'active' },
      ];

      // No interactions between Metformin and Lisinopril
      db._mockQuery.where.mockResolvedValueOnce(activePrescriptions);
      db._mockQuery.orWhere.mockResolvedValueOnce([]);
      db._mockQuery.returning.mockResolvedValueOnce([{ id: 'rx-new', ...data, status: 'active', prescribed_by: user.id }]);

      const result = await PrescriptionService.create(data, user);

      expect(result.id).toBe('rx-new');
      expect(result.drug_name).toBe('Metformin');
    });
  });

  describe('refill', () => {
    it('should throw PRESCRIPTION_NOT_FOUND when prescription does not exist', async () => {
      // where({id}) returns this (default), then .first() returns null
      db._mockQuery.first.mockResolvedValueOnce(null);

      await expect(PrescriptionService.refill('nonexistent-id', user))
        .rejects.toThrow('Prescription not found');
    });

    it('should throw DRUG_INTERACTION_FOUND on refill when new interactions exist', async () => {
      const existingRx = {
        id: 'rx-1',
        patient_id: 'patient-1',
        drug_name: 'Aspirin',
        status: 'active',
      };

      const activePrescriptions = [
        { id: 'rx-2', patient_id: 'patient-1', drug_name: 'Warfarin', status: 'active' },
      ];
      const interactions = [
        { id: 'int-1', drug_a: 'Aspirin', drug_b: 'Warfarin', severity: 'major' },
      ];

      // where({id}) -> mockQuery (has .first), then where({patient_id,status}) -> active rxs
      const q = db._mockQuery;
      q.where
        .mockReturnValueOnce(q)                      // refill: where({id}) -> chain
        .mockResolvedValueOnce(activePrescriptions);  // checkInteractions: where({patient_id,status})
      q.first.mockResolvedValueOnce(existingRx);
      q.orWhere.mockResolvedValueOnce(interactions);

      try {
        await PrescriptionService.refill('rx-1', user);
        throw new Error('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe(ErrorCodes.DRUG_INTERACTION_FOUND);
        expect(err.message).toContain('refill');
      }
    });

    it('should refill prescription when no interactions exist', async () => {
      const existingRx = {
        id: 'rx-1',
        patient_id: 'patient-1',
        drug_name: 'Metformin',
        status: 'active',
      };

      const q = db._mockQuery;
      // where({id}) -> mockQuery (has .first), then where({patient_id,status}) -> []
      q.where
        .mockReturnValueOnce(q)    // refill: where({id}) -> chain to .first()
        .mockResolvedValueOnce([]) // checkInteractions: where({patient_id,status}) -> no rxs
        .mockReturnValueOnce(q);   // refill update: where({id}) -> chain to .update()
      q.first.mockResolvedValueOnce(existingRx);

      const updatedRx = { ...existingRx, refill_count: 2 };
      q.returning.mockResolvedValueOnce([updatedRx]);

      const result = await PrescriptionService.refill('rx-1', user);

      expect(result).toEqual(updatedRx);
      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(user, 'patient-1');
    });
  });

  describe('getByPatient', () => {
    it('should return prescriptions ordered by created_at descending', async () => {
      const patientId = 'patient-1';
      const mockPrescriptions = [
        { id: 'rx-2', patient_id: patientId, drug_name: 'Metformin', created_at: '2026-04-06' },
        { id: 'rx-1', patient_id: patientId, drug_name: 'Lisinopril', created_at: '2026-04-05' },
      ];

      const q = db._mockQuery;
      q.where.mockReturnValueOnce(q); // where({patient_id}) -> chain
      q.orderBy.mockResolvedValueOnce(mockPrescriptions);

      const result = await PrescriptionService.getByPatient(patientId, user);

      expect(result).toEqual(mockPrescriptions);
      expect(db).toHaveBeenCalledWith('prescriptions');
      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(user, patientId);
    });
  });
});
