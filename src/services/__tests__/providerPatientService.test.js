const ProviderPatientService = require('../providerPatientService');
const db = require('../../models/db');

jest.mock('../../models/db', () => {
  const mKnex = jest.fn();
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
    select: jest.fn(),
    orderBy: jest.fn(),
  });
  return mKnex;
});

describe('ProviderPatientService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAssigned', () => {
    it('should return true when provider is assigned to patient', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
      };
      db.mockImplementation(() => mockQuery);

      const result = await ProviderPatientService.isAssigned('provider-1', 'patient-1');

      expect(result).toBe(true);
      expect(db).toHaveBeenCalledWith('provider_patient_assignments');
      expect(mockQuery.where).toHaveBeenCalledWith({
        provider_id: 'provider-1',
        patient_id: 'patient-1',
        status: 'active',
      });
    });

    it('should return false when provider is not assigned to patient', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => mockQuery);

      const result = await ProviderPatientService.isAssigned('provider-1', 'patient-99');

      expect(result).toBe(false);
    });
  });

  describe('verifyAccess', () => {
    it('should allow access for admin users without checking assignment', async () => {
      const adminUser = { id: 'user-1', role: 'admin', provider_id: 'provider-1' };

      const result = await ProviderPatientService.verifyAccess(adminUser, 'patient-1');

      expect(result).toBe(true);
      expect(db).not.toHaveBeenCalled();
    });

    it('should allow access when provider is assigned to patient', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
      };
      db.mockImplementation(() => mockQuery);

      const user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
      const result = await ProviderPatientService.verifyAccess(user, 'patient-1');

      expect(result).toBe(true);
    });

    it('should deny access with 403 when provider is not assigned to patient', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => mockQuery);

      const user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };

      try {
        await ProviderPatientService.verifyAccess(user, 'patient-99');
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toBe('Access denied: provider not assigned to this patient');
      }
    });
  });

  describe('assign', () => {
    it('should allow admin to assign a provider to a patient', async () => {
      const existingQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{
          id: 'assignment-1',
          provider_id: 'provider-2',
          patient_id: 'patient-1',
          status: 'active',
        }]),
      };

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return existingQuery;
        return insertQuery;
      });

      const adminUser = { id: 'admin-1', role: 'admin' };
      const data = { provider_id: 'provider-2', patient_id: 'patient-1' };
      const result = await ProviderPatientService.assign(data, adminUser);

      expect(result).toEqual(expect.objectContaining({ provider_id: 'provider-2', patient_id: 'patient-1' }));
    });

    it('should return existing assignment if already active', async () => {
      const existingAssignment = {
        id: 'assignment-1',
        provider_id: 'provider-2',
        patient_id: 'patient-1',
        status: 'active',
      };
      const existingQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(existingAssignment),
      };
      db.mockImplementation(() => existingQuery);

      const adminUser = { id: 'admin-1', role: 'admin' };
      const data = { provider_id: 'provider-2', patient_id: 'patient-1' };
      const result = await ProviderPatientService.assign(data, adminUser);

      expect(result).toEqual(existingAssignment);
    });

    it('should deny non-admin users from creating assignments', async () => {
      const user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
      const data = { provider_id: 'provider-2', patient_id: 'patient-1' };

      try {
        await ProviderPatientService.assign(data, user);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toBe('Only administrators can manage provider-patient assignments');
      }
    });
  });

  describe('revoke', () => {
    it('should allow admin to revoke an assignment', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{
          id: 'assignment-1',
          status: 'revoked',
          revoked_by: 'admin-1',
        }]),
      };
      db.mockImplementation(() => mockQuery);

      const adminUser = { id: 'admin-1', role: 'admin' };
      const data = { provider_id: 'provider-2', patient_id: 'patient-1' };
      const result = await ProviderPatientService.revoke(data, adminUser);

      expect(result.status).toBe('revoked');
    });

    it('should deny non-admin users from revoking assignments', async () => {
      const user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
      const data = { provider_id: 'provider-2', patient_id: 'patient-1' };

      try {
        await ProviderPatientService.revoke(data, user);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });

    it('should return 404 when assignment not found', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
      };
      db.mockImplementation(() => mockQuery);

      const adminUser = { id: 'admin-1', role: 'admin' };
      const data = { provider_id: 'provider-2', patient_id: 'patient-1' };

      try {
        await ProviderPatientService.revoke(data, adminUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toBe('Assignment not found');
      }
    });
  });

  describe('listByProvider', () => {
    it('should return active assignments for a provider', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([
          { id: 'a1', patient_id: 'patient-1' },
          { id: 'a2', patient_id: 'patient-2' },
        ]),
      };
      db.mockImplementation(() => mockQuery);

      const result = await ProviderPatientService.listByProvider('provider-1');

      expect(result).toHaveLength(2);
      expect(mockQuery.where).toHaveBeenCalledWith({ provider_id: 'provider-1', status: 'active' });
    });
  });

  describe('listByPatient', () => {
    it('should return active assignments for a patient', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([
          { id: 'a1', provider_id: 'provider-1' },
        ]),
      };
      db.mockImplementation(() => mockQuery);

      const result = await ProviderPatientService.listByPatient('patient-1');

      expect(result).toHaveLength(1);
      expect(mockQuery.where).toHaveBeenCalledWith({ patient_id: 'patient-1', status: 'active' });
    });
  });
});
