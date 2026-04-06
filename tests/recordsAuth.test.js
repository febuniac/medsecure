const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');

const TEST_SECRET = 'test-jwt-secret-key';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

const { generateToken } = require('../src/middleware/auth');

// Mock the db module
jest.mock('../src/models/db', () => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ total: 0 }),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 'rec-1', patient_id: 'p-1' }]),
    select: jest.fn().mockResolvedValue([]),
  };
  const db = jest.fn(() => mockQuery);
  db._mockQuery = mockQuery;
  return db;
});

// Mock providerPatientService to avoid DB calls
jest.mock('../src/services/providerPatientService', () => ({
  verifyAccess: jest.fn().mockResolvedValue(true),
}));

const recordsRouter = require('../src/api/records');

function createApp() {
  const app = express();
  app.use(express.json());
  // Mount records router WITHOUT router-level auth to isolate route-level auth
  app.use('/records', recordsRouter);
  return app;
}

describe('Records API - Authentication Enforcement', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('GET /records/:id', () => {
    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app).get('/records/rec-123');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 401 when an invalid token is provided', async () => {
      const res = await request(app)
        .get('/records/rec-123')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should allow access with a valid auth token', async () => {
      const db = require('../src/models/db');
      db._mockQuery.first.mockResolvedValueOnce({ id: 'rec-123', patient_id: 'p-1' });
      db._mockQuery.select.mockResolvedValueOnce([]);

      const token = generateToken({ id: 'user-1', email: 'doc@medsecure.com', role: 'physician' });
      const res = await request(app)
        .get('/records/rec-123')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /records/patient/:patientId', () => {
    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app).get('/records/patient/p-123');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 401 when an invalid token is provided', async () => {
      const res = await request(app)
        .get('/records/patient/p-123')
        .set('Authorization', 'Bearer bad-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /records', () => {
    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app)
        .post('/records')
        .send({ patient_id: 'p-1', type: 'note', content: 'test' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 401 when an invalid token is provided', async () => {
      const res = await request(app)
        .post('/records')
        .send({ patient_id: 'p-1', type: 'note', content: 'test' })
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });
});
