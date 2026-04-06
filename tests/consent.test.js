const ConsentService = require('../src/services/consentService');

// Mock the db module
jest.mock('../src/models/db', () => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
  };

  const db = jest.fn(() => mockQuery);
  db._mockQuery = mockQuery;
  return db;
});

const db = require('../src/models/db');

describe('ConsentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const q = db._mockQuery;
    q.where.mockReturnThis();
    q.orderBy.mockReturnThis();
    q.insert.mockReturnThis();
    q.update.mockReturnThis();
  });

  describe('create', () => {
    const user = { id: 'user-1', role: 'provider' };

    it('should add consented_at timestamp to the consent record', async () => {
      const data = {
        patient_id: 'patient-123',
        type: 'treatment',
        description: 'Consent for treatment',
      };

      const now = '2026-04-06T04:00:00.000Z';
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(now);

      const expectedRecord = {
        id: 'consent-1',
        ...data,
        consented_at: now,
        created_by: user.id,
      };

      db._mockQuery.returning.mockResolvedValue([expectedRecord]);

      const result = await ConsentService.create(data, user);

      expect(result).toEqual(expectedRecord);
      expect(result.consented_at).toBe(now);

      // Verify the insert was called with consented_at
      expect(db._mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          consented_at: now,
          created_by: user.id,
          patient_id: 'patient-123',
        })
      );

      Date.prototype.toISOString.mockRestore();
    });

    it('should include consented_at as a valid ISO 8601 timestamp', async () => {
      const data = {
        patient_id: 'patient-456',
        type: 'data-sharing',
      };

      const expectedRecord = {
        id: 'consent-2',
        ...data,
        consented_at: new Date().toISOString(),
        created_by: user.id,
      };

      db._mockQuery.returning.mockResolvedValue([expectedRecord]);

      const result = await ConsentService.create(data, user);

      // Verify consented_at is a valid ISO string
      expect(result.consented_at).toBeDefined();
      expect(new Date(result.consented_at).toISOString()).toBe(result.consented_at);
    });

    it('should set created_by from user id', async () => {
      const data = { patient_id: 'patient-789', type: 'research' };

      const expectedRecord = {
        id: 'consent-3',
        ...data,
        consented_at: new Date().toISOString(),
        created_by: user.id,
      };

      db._mockQuery.returning.mockResolvedValue([expectedRecord]);

      await ConsentService.create(data, user);

      expect(db._mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'user-1' })
      );
    });
  });

  describe('getByPatient', () => {
    it('should return consents ordered by consented_at descending', async () => {
      const patientId = 'patient-123';
      const mockConsents = [
        { id: 'c-1', patient_id: patientId, consented_at: '2026-04-06T04:00:00.000Z' },
        { id: 'c-2', patient_id: patientId, consented_at: '2026-04-05T04:00:00.000Z' },
      ];

      db._mockQuery.orderBy.mockResolvedValue(mockConsents);

      const result = await ConsentService.getByPatient(patientId);

      expect(result).toEqual(mockConsents);
      expect(db).toHaveBeenCalledWith('consents');
      expect(db._mockQuery.where).toHaveBeenCalledWith({ patient_id: patientId });
      expect(db._mockQuery.orderBy).toHaveBeenCalledWith('consented_at', 'desc');
    });
  });

  describe('revoke', () => {
    const user = { id: 'user-1', role: 'provider' };

    it('should revoke an existing consent and add revoked_at timestamp', async () => {
      const consentId = 'consent-1';
      const existingConsent = {
        id: consentId,
        patient_id: 'patient-123',
        status: 'active',
        consented_at: '2026-04-05T04:00:00.000Z',
      };

      const now = '2026-04-06T04:00:00.000Z';
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(now);

      db._mockQuery.first.mockResolvedValue(existingConsent);

      const revokedConsent = {
        ...existingConsent,
        status: 'revoked',
        revoked_at: now,
        revoked_by: user.id,
      };
      db._mockQuery.returning.mockResolvedValue([revokedConsent]);

      const result = await ConsentService.revoke(consentId, user);

      expect(result.status).toBe('revoked');
      expect(result.revoked_at).toBe(now);
      expect(result.revoked_by).toBe(user.id);

      Date.prototype.toISOString.mockRestore();
    });

    it('should throw an error when consent record is not found', async () => {
      db._mockQuery.first.mockResolvedValue(null);

      await expect(ConsentService.revoke('nonexistent-id', user))
        .rejects.toThrow('Consent record not found');
    });
  });
});
