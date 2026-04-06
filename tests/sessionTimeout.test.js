const jwt = require('jsonwebtoken');

// Mock db module to avoid knex dependency
jest.mock('../src/models/db', () => jest.fn());

const { SESSION_EXPIRY } = require('../src/api/auth');

const JWT_SECRET = 'test-secret-key';

describe('Session Timeout - HIPAA Compliance', () => {
  describe('SESSION_EXPIRY constant', () => {
    it('should be set to 15 minutes', () => {
      expect(SESSION_EXPIRY).toBe('15m');
    });
  });

  describe('JWT token expiration', () => {
    it('should create a token that expires in 15 minutes', () => {
      const payload = { id: 1, email: 'doctor@hospital.com', role: 'provider' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY });
      const decoded = jwt.verify(token, JWT_SECRET);

      const expectedExpiry = Math.floor(Date.now() / 1000) + 15 * 60;
      // Allow 5 seconds of tolerance for test execution time
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry - 5);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5);
    });

    it('should not create a token valid for more than 15 minutes', () => {
      const payload = { id: 1, email: 'doctor@hospital.com', role: 'provider' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY });
      const decoded = jwt.verify(token, JWT_SECRET);

      const fifteenMinutesFromNow = Math.floor(Date.now() / 1000) + 15 * 60;
      expect(decoded.exp).toBeLessThanOrEqual(fifteenMinutesFromNow + 5);
    });

    it('should reject an expired token', () => {
      const payload = { id: 1, email: 'doctor@hospital.com', role: 'provider' };
      // Create a token that expired 1 second ago
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });

      expect(() => jwt.verify(token, JWT_SECRET)).toThrow('jwt expired');
    });

    it('should not exceed HIPAA maximum session duration of 15 minutes', () => {
      // Parse the SESSION_EXPIRY value to ensure it's <= 15 minutes
      const match = SESSION_EXPIRY.match(/^(\d+)(m|h|s|d)$/);
      expect(match).not.toBeNull();

      const value = parseInt(match[1], 10);
      const unit = match[2];

      let durationInMinutes;
      switch (unit) {
        case 's': durationInMinutes = value / 60; break;
        case 'm': durationInMinutes = value; break;
        case 'h': durationInMinutes = value * 60; break;
        case 'd': durationInMinutes = value * 1440; break;
      }

      expect(durationInMinutes).toBeLessThanOrEqual(15);
    });
  });
});
