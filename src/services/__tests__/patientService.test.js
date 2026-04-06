const PatientService = require('../patientService');
const ProviderPatientService = require('../providerPatientService');
const db = require('../../models/db');

jest.mock('../../models/db', () => {
  const mKnex = jest.fn();
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
    select: jest.fn(),
  });
  return mKnex;
});

jest.mock('../providerPatientService');
jest.mock('../../utils/encryption', () => ({
  encrypt: jest.fn((val) => Promise.resolve(`encrypted_${val}`)),
  decrypt: jest.fn((val) => Promise.resolve(val ? val.replace('encrypted_', '') : val)),
}));

describe('PatientService', () => {
  const providerUser = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
  const adminUser = { id: 'admin-1', role: 'admin', provider_id: 'provider-admin' };
  const otherProvider = { id: 'user-2', role: 'provider', provider_id: 'provider-2' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return only patients assigned to the provider', async () => {
      const assignmentsQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { patient_id: 'patient-1' },
          { patient_id: 'patient-2' },
        ]),
      };
      const patientsQuery = {
        whereIn: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { id: 'patient-1', first_name: 'John' },
          { id: 'patient-2', first_name: 'Jane' },
        ]),
      };

      let callCount = 0;
      db.mockImplementation((table) => {
        callCount++;
        if (table === 'provider_patient_assignments') return assignmentsQuery;
        if (table === 'patients') return patientsQuery;
        return {};
      });

      const result = await PatientService.list({}, providerUser);

      expect(result).toHaveLength(2);
      expect(assignmentsQuery.where).toHaveBeenCalledWith({
        provider_id: 'provider-1',
        status: 'active',
      });
    });

    it('should return empty array when provider has no assignments', async () => {
      const assignmentsQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      };
      db.mockImplementation(() => assignmentsQuery);

      const result = await PatientService.list({}, otherProvider);

      expect(result).toEqual([]);
    });

    it('should return all patients for admin users', async () => {
      const patientsQuery = {
        select: jest.fn().mockResolvedValue([
          { id: 'patient-1' },
          { id: 'patient-2' },
          { id: 'patient-3' },
        ]),
      };
      db.mockImplementation(() => patientsQuery);

      const result = await PatientService.list({}, adminUser);

      expect(result).toHaveLength(3);
      expect(db).toHaveBeenCalledWith('patients');
    });
  });

  describe('getById', () => {
    it('should return patient when provider is assigned', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockPatient = { id: 'patient-1', first_name: 'John', ssn_encrypted: 'encrypted_123-45-6789' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockPatient),
      };
      db.mockImplementation(() => mockQuery);

      const result = await PatientService.getById('patient-1', providerUser);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(providerUser, 'patient-1');
      expect(result.ssn).toBe('123-45-6789');
    });

    it('should deny access when provider is not assigned to patient', async () => {
      const accessError = new Error('Access denied: provider not assigned to this patient');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      try {
        await PatientService.getById('patient-1', otherProvider);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
        expect(err.message).toContain('Access denied');
      }
    });

    it('should allow admin to access any patient', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockPatient = { id: 'patient-1', first_name: 'John', ssn_encrypted: 'encrypted_123-45-6789' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockPatient),
      };
      db.mockImplementation(() => mockQuery);

      const result = await PatientService.getById('patient-1', adminUser);

      expect(result.first_name).toBe('John');
    });
  });

  describe('update', () => {
    it('should update patient when provider is assigned', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'patient-1', first_name: 'John Updated' }]),
      };
      db.mockImplementation(() => mockQuery);

      const result = await PatientService.update('patient-1', { first_name: 'John Updated' }, providerUser);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(providerUser, 'patient-1');
      expect(result.first_name).toBe('John Updated');
    });

    it('should deny update when provider is not assigned', async () => {
      const accessError = new Error('Access denied: provider not assigned to this patient');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      try {
        await PatientService.update('patient-1', { first_name: 'Hacked' }, otherProvider);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });
  });
});
