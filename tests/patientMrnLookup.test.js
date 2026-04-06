const PatientService = require('../src/services/patientService');
const ProviderPatientService = require('../src/services/providerPatientService');
const db = require('../src/models/db');

jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  return mKnex;
});

jest.mock('../src/services/providerPatientService');
jest.mock('../src/utils/encryption', () => ({
  encrypt: jest.fn((val) => `encrypted_${val}`),
  decrypt: jest.fn((val) => (val ? val.replace('encrypted_', '') : val)),
}));

describe('PatientService.getByMrn', () => {
  const providerUser = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };
  const adminUser = { id: 'admin-1', role: 'admin', provider_id: 'provider-admin' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return patient when found by MRN', async () => {
    const mockPatient = {
      id: 'patient-1',
      mrn: 'MRN-001',
      first_name: 'John',
      last_name: 'Doe',
      ssn_encrypted: 'encrypted_123-45-6789',
    };
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockPatient),
    };
    db.mockImplementation(() => mockQuery);
    ProviderPatientService.verifyAccess.mockResolvedValue(true);

    const result = await PatientService.getByMrn('MRN-001', providerUser);

    expect(db).toHaveBeenCalledWith('patients');
    expect(mockQuery.where).toHaveBeenCalledWith({ mrn: 'MRN-001' });
    expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(providerUser, 'patient-1');
    expect(result.ssn).toBe('123-45-6789');
    expect(result.mrn).toBe('MRN-001');
  });

  it('should throw PATIENT_NOT_FOUND when MRN does not exist', async () => {
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
    };
    db.mockImplementation(() => mockQuery);

    await expect(PatientService.getByMrn('MRN-INVALID', adminUser)).rejects.toThrow(
      'Patient not found'
    );
  });

  it('should verify provider access before returning patient', async () => {
    const mockPatient = {
      id: 'patient-2',
      mrn: 'MRN-002',
      first_name: 'Jane',
      ssn_encrypted: 'encrypted_987-65-4321',
    };
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockPatient),
    };
    db.mockImplementation(() => mockQuery);

    const accessError = new Error('Access denied: provider not assigned to this patient');
    accessError.status = 403;
    ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

    await expect(PatientService.getByMrn('MRN-002', providerUser)).rejects.toThrow(
      'Access denied'
    );
    expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(providerUser, 'patient-2');
  });

  it('should allow admin to look up any patient by MRN', async () => {
    const mockPatient = {
      id: 'patient-3',
      mrn: 'MRN-003',
      first_name: 'Alice',
      ssn_encrypted: 'encrypted_111-22-3333',
    };
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockPatient),
    };
    db.mockImplementation(() => mockQuery);
    ProviderPatientService.verifyAccess.mockResolvedValue(true);

    const result = await PatientService.getByMrn('MRN-003', adminUser);

    expect(result.first_name).toBe('Alice');
    expect(result.ssn).toBe('111-22-3333');
  });

  it('should decrypt SSN when returning patient by MRN', async () => {
    const mockPatient = {
      id: 'patient-4',
      mrn: 'MRN-004',
      first_name: 'Bob',
      ssn_encrypted: 'encrypted_555-66-7777',
    };
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockPatient),
    };
    db.mockImplementation(() => mockQuery);
    ProviderPatientService.verifyAccess.mockResolvedValue(true);

    const result = await PatientService.getByMrn('MRN-004', adminUser);

    expect(result.ssn).toBe('555-66-7777');
  });
});
