const ProviderPatientService = require('../src/services/providerPatientService');
const RecordService = require('../src/services/recordService');
const PatientService = require('../src/services/patientService');
const { requirePatientAccess, requireAdmin } = require('../src/middleware/providerPatientAuth');

// Mock the database
jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  mKnex.raw = jest.fn((val) => val);
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    andOn: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
    select: jest.fn(),
  });
  return mKnex;
});

jest.mock('../src/utils/encryption', () => ({
  encrypt: jest.fn((val) => `encrypted:${val}`),
  decrypt: jest.fn((val) => val.replace('encrypted:', '')),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const db = require('../src/models/db');

describe('Provider-Patient Access Controls', () => {
  const assignedProvider = {
    id: 'user-1',
    provider_id: 'provider-1',
    role: 'provider',
  };
  const unassignedProvider = {
    id: 'user-2',
    provider_id: 'provider-2',
    role: 'provider',
  };
  const adminUser = {
    id: 'admin-1',
    provider_id: 'provider-admin',
    role: 'admin',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ProviderPatientService', () => {
    describe('isAssigned', () => {
      it('should return true when provider is assigned to patient', async () => {
        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({
            id: 'assignment-1',
            provider_id: 'provider-1',
            patient_id: 'patient-1',
            status: 'active',
          }),
        };
        db.mockImplementation(() => mockQuery);

        const result = await ProviderPatientService.isAssigned('provider-1', 'patient-1');
        expect(result).toBe(true);
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

        const result = await ProviderPatientService.isAssigned('provider-2', 'patient-1');
        expect(result).toBe(false);
      });
    });

    describe('verifyAccess', () => {
      it('should grant access to admin users without checking assignment', async () => {
        const result = await ProviderPatientService.verifyAccess(adminUser, 'patient-1');
        expect(result).toBe(true);
        // db should not be called for admin users
        expect(db).not.toHaveBeenCalled();
      });

      it('should grant access to assigned providers', async () => {
        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
        };
        db.mockImplementation(() => mockQuery);

        const result = await ProviderPatientService.verifyAccess(assignedProvider, 'patient-1');
        expect(result).toBe(true);
      });

      it('should deny access to unassigned providers', async () => {
        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        db.mockImplementation(() => mockQuery);

        const result = await ProviderPatientService.verifyAccess(unassignedProvider, 'patient-1');
        expect(result).toBe(false);
      });
    });

    describe('assign', () => {
      it('should create a new assignment', async () => {
        const existingQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        const insertQuery = {
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{
            id: 'assignment-1',
            provider_id: 'provider-1',
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

        const result = await ProviderPatientService.assign(
          { provider_id: 'provider-1', patient_id: 'patient-1' },
          adminUser
        );
        expect(result.status).toBe('active');
        expect(result.provider_id).toBe('provider-1');
      });

      it('should return existing assignment if already exists', async () => {
        const existingAssignment = {
          id: 'assignment-1',
          provider_id: 'provider-1',
          patient_id: 'patient-1',
          status: 'active',
        };
        const existingQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(existingAssignment),
        };
        db.mockImplementation(() => existingQuery);

        const result = await ProviderPatientService.assign(
          { provider_id: 'provider-1', patient_id: 'patient-1' },
          adminUser
        );
        expect(result).toEqual(existingAssignment);
      });
    });

    describe('revoke', () => {
      it('should revoke an active assignment', async () => {
        const findQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
        };
        const updateQuery = {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{
            id: 'assignment-1',
            status: 'revoked',
            revoked_by: 'admin-1',
          }]),
        };

        let callCount = 0;
        db.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return findQuery;
          return updateQuery;
        });

        const result = await ProviderPatientService.revoke('provider-1', 'patient-1', adminUser);
        expect(result.status).toBe('revoked');
      });

      it('should throw 404 when assignment not found', async () => {
        const findQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        db.mockImplementation(() => findQuery);

        await expect(
          ProviderPatientService.revoke('provider-1', 'patient-1', adminUser)
        ).rejects.toThrow('Assignment not found');

        try {
          await ProviderPatientService.revoke('provider-1', 'patient-1', adminUser);
        } catch (err) {
          expect(err.status).toBe(404);
        }
      });
    });
  });

  describe('RecordService - Access Controls', () => {
    describe('getByPatient', () => {
      it('should return records for an assigned provider', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
        };
        const recordsQuery = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([
            { id: 'record-1', patient_id: 'patient-1' },
            { id: 'record-2', patient_id: 'patient-1' },
          ]),
        };

        let callCount = 0;
        db.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return assignmentQuery;
          return recordsQuery;
        });

        const records = await RecordService.getByPatient('patient-1', assignedProvider);
        expect(records).toHaveLength(2);
      });

      it('should deny access for an unassigned provider', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        db.mockImplementation(() => assignmentQuery);

        await expect(
          RecordService.getByPatient('patient-1', unassignedProvider)
        ).rejects.toThrow('Access denied: you are not assigned to this patient');

        try {
          await RecordService.getByPatient('patient-1', unassignedProvider);
        } catch (err) {
          expect(err.status).toBe(403);
        }
      });

      it('should allow admin to access any patient records', async () => {
        const recordsQuery = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([{ id: 'record-1' }]),
        };
        db.mockImplementation(() => recordsQuery);

        const records = await RecordService.getByPatient('patient-1', adminUser);
        expect(records).toHaveLength(1);
      });
    });

    describe('getById', () => {
      it('should return record for an assigned provider', async () => {
        const recordQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'record-1', patient_id: 'patient-1' }),
        };
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
        };

        let callCount = 0;
        db.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return recordQuery;
          return assignmentQuery;
        });

        const record = await RecordService.getById('record-1', assignedProvider);
        expect(record).toBeDefined();
        expect(record.id).toBe('record-1');
      });

      it('should deny access for an unassigned provider on getById', async () => {
        const recordQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'record-1', patient_id: 'patient-1' }),
        };
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };

        let callCount = 0;
        db.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return recordQuery;
          return assignmentQuery;
        });

        await expect(
          RecordService.getById('record-1', unassignedProvider)
        ).rejects.toThrow('Access denied: you are not assigned to this patient');
      });

      it('should return null for non-existent record', async () => {
        const recordQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
        db.mockImplementation(() => recordQuery);

        const record = await RecordService.getById('nonexistent', assignedProvider);
        expect(record).toBeNull();
      });
    });

    describe('create', () => {
      it('should allow assigned provider to create record', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
        };
        const insertQuery = {
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'record-new', patient_id: 'patient-1' }]),
        };

        let callCount = 0;
        db.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return assignmentQuery;
          return insertQuery;
        });

        const record = await RecordService.create(
          { patient_id: 'patient-1', type: 'note', content: 'Test' },
          assignedProvider
        );
        expect(record).toBeDefined();
      });

      it('should deny unassigned provider from creating record', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        db.mockImplementation(() => assignmentQuery);

        await expect(
          RecordService.create({ patient_id: 'patient-1' }, unassignedProvider)
        ).rejects.toThrow('Access denied: you are not assigned to this patient');
      });
    });
  });

  describe('PatientService - Access Controls', () => {
    describe('getById', () => {
      it('should deny access for unassigned provider', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        db.mockImplementation(() => assignmentQuery);

        await expect(
          PatientService.getById('patient-1', unassignedProvider)
        ).rejects.toThrow('Access denied: you are not assigned to this patient');

        try {
          await PatientService.getById('patient-1', unassignedProvider);
        } catch (err) {
          expect(err.status).toBe(403);
        }
      });

      it('should allow admin to access any patient', async () => {
        const patientQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({
            id: 'patient-1',
            first_name: 'John',
            ssn_encrypted: 'encrypted:123-45-6789',
          }),
        };
        db.mockImplementation(() => patientQuery);

        const patient = await PatientService.getById('patient-1', adminUser);
        expect(patient).toBeDefined();
        expect(patient.first_name).toBe('John');
      });

      it('should allow assigned provider to access patient', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
        };
        const patientQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({
            id: 'patient-1',
            first_name: 'John',
            ssn_encrypted: 'encrypted:123-45-6789',
          }),
        };

        let callCount = 0;
        db.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return assignmentQuery;
          return patientQuery;
        });

        const patient = await PatientService.getById('patient-1', assignedProvider);
        expect(patient).toBeDefined();
        expect(patient.first_name).toBe('John');
      });
    });

    describe('list', () => {
      it('should return only assigned patients for providers', async () => {
        const mockJoinQuery = {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([
            { id: 'patient-1', first_name: 'John' },
          ]),
          on: jest.fn().mockReturnThis(),
          andOn: jest.fn().mockReturnThis(),
        };
        db.mockImplementation(() => mockJoinQuery);

        const patients = await PatientService.list({}, assignedProvider);
        expect(patients).toHaveLength(1);
        expect(db).toHaveBeenCalledWith('patients');
      });

      it('should return all patients for admin users', async () => {
        const mockQuery = {
          select: jest.fn().mockResolvedValue([
            { id: 'patient-1' },
            { id: 'patient-2' },
            { id: 'patient-3' },
          ]),
        };
        db.mockImplementation(() => mockQuery);

        const patients = await PatientService.list({}, adminUser);
        expect(patients).toHaveLength(3);
      });
    });

    describe('update', () => {
      it('should deny update for unassigned provider', async () => {
        const assignmentQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
        };
        db.mockImplementation(() => assignmentQuery);

        await expect(
          PatientService.update('patient-1', { first_name: 'Updated' }, unassignedProvider)
        ).rejects.toThrow('Access denied: you are not assigned to this patient');
      });
    });
  });

  describe('requirePatientAccess middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        params: {},
        body: {},
        user: assignedProvider,
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    it('should return 400 if patientId is not provided', async () => {
      const middleware = requirePatientAccess('patientId');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Patient ID is required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow admin to bypass access check', async () => {
      mockReq.params.patientId = 'patient-1';
      mockReq.user = adminUser;

      const middleware = requirePatientAccess('patientId');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow assigned provider access', async () => {
      mockReq.params.patientId = 'patient-1';
      const assignmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
      };
      db.mockImplementation(() => assignmentQuery);

      const middleware = requirePatientAccess('patientId');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny unassigned provider access with 403', async () => {
      mockReq.params.patientId = 'patient-1';
      mockReq.user = unassignedProvider;
      const assignmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => assignmentQuery);

      const middleware = requirePatientAccess('patientId');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access denied: you are not assigned to this patient',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should extract patient_id from body when param not present', async () => {
      mockReq.body.patient_id = 'patient-1';
      const assignmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'assignment-1', status: 'active' }),
      };
      db.mockImplementation(() => assignmentQuery);

      const middleware = requirePatientAccess('patientId');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAdmin middleware', () => {
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    it('should allow admin users', () => {
      const mockReq = { user: adminUser };
      requireAdmin(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny non-admin users with 403', () => {
      const mockReq = { user: assignedProvider };
      requireAdmin(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
