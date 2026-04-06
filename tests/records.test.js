const RecordService = require('../src/services/recordService');

// Mock the db module
jest.mock('../src/models/db', () => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn()
  };

  const db = jest.fn(() => mockQuery);
  db._mockQuery = mockQuery;
  return db;
});

const db = require('../src/models/db');

describe('RecordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset chainable mocks
    const q = db._mockQuery;
    q.where.mockReturnThis();
    q.orderBy.mockReturnThis();
    q.limit.mockReturnThis();
    q.offset.mockReturnThis();
    q.count.mockReturnThis();
  });

  describe('getByPatient', () => {
    const patientId = 'patient-123';
    const user = { id: 'user-1', role: 'provider' };

    function setupMocks(records, total) {
      const q = db._mockQuery;
      // The method uses Promise.all with two parallel queries.
      // First call chain resolves to records (via offset at end of chain).
      // Second call chain resolves to count result (via first at end of chain).
      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        const chain = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue(records),
          count: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ total })
        };
        return chain;
      });
    }

    it('should return paginated records with default page=1 and limit=20', async () => {
      const mockRecords = Array.from({ length: 20 }, (_, i) => ({
        id: `rec-${i}`,
        patient_id: patientId,
        date: new Date(2025, 0, 20 - i).toISOString()
      }));
      setupMocks(mockRecords, 150);

      const result = await RecordService.getByPatient(patientId, user);

      expect(result.data).toHaveLength(20);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 150,
        totalPages: 8
      });
    });

    it('should respect custom page and limit parameters', async () => {
      const mockRecords = [{ id: 'rec-1', patient_id: patientId }];
      setupMocks(mockRecords, 50);

      const result = await RecordService.getByPatient(patientId, user, { page: 3, limit: 10 });

      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 50,
        totalPages: 5
      });

      // Verify offset was called correctly: (page-1) * limit = 20
      const firstDbCall = db.mock.results[0].value;
      expect(firstDbCall.offset).toHaveBeenCalledWith(20);
      expect(firstDbCall.limit).toHaveBeenCalledWith(10);
    });

    it('should cap limit at MAX_LIMIT (100)', async () => {
      setupMocks([], 0);

      const result = await RecordService.getByPatient(patientId, user, { page: 1, limit: 500 });

      expect(result.pagination.limit).toBe(100);
    });

    it('should default to page 1 for invalid page values', async () => {
      setupMocks([], 0);

      const result = await RecordService.getByPatient(patientId, user, { page: -5, limit: 10 });

      expect(result.pagination.page).toBe(1);
    });

    it('should default to limit 20 for invalid limit values', async () => {
      setupMocks([], 0);

      const result = await RecordService.getByPatient(patientId, user, { page: 1, limit: 'abc' });

      expect(result.pagination.limit).toBe(20);
    });

    it('should handle string page and limit from query params', async () => {
      setupMocks([], 10);

      const result = await RecordService.getByPatient(patientId, user, { page: '2', limit: '5' });

      expect(result.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 10,
        totalPages: 2
      });
    });

    it('should return empty data with correct pagination when no records found', async () => {
      setupMocks([], 0);

      const result = await RecordService.getByPatient(patientId, user);

      expect(result.data).toHaveLength(0);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      });
    });

    it('should calculate totalPages correctly for non-even division', async () => {
      setupMocks([], 21);

      const result = await RecordService.getByPatient(patientId, user, { page: 1, limit: 10 });

      expect(result.pagination.totalPages).toBe(3);
    });

    it('should work with no pagination options (backwards compatible)', async () => {
      const mockRecords = [{ id: 'rec-1' }];
      setupMocks(mockRecords, 1);

      const result = await RecordService.getByPatient(patientId, user);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });
  });
});
