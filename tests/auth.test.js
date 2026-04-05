const { validatePassword } = require('../src/utils/passwordValidator');

describe('Password Complexity Validation', () => {
  describe('validatePassword', () => {
    it('should reject empty password', () => {
      const errors = validatePassword('');
      expect(errors).toContain('Password is required');
    });

    it('should reject undefined password', () => {
      const errors = validatePassword(undefined);
      expect(errors).toContain('Password is required');
    });

    it('should reject null password', () => {
      const errors = validatePassword(null);
      expect(errors).toContain('Password is required');
    });

    it('should reject password shorter than 8 characters', () => {
      const errors = validatePassword('Ab1defg');
      expect(errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', () => {
      const errors = validatePassword('abcdefg1');
      expect(errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', () => {
      const errors = validatePassword('ABCDEFG1');
      expect(errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', () => {
      const errors = validatePassword('Abcdefgh');
      expect(errors).toContain('Password must contain at least one number');
    });

    it('should return multiple errors for multiple violations', () => {
      const errors = validatePassword('abc');
      expect(errors.length).toBeGreaterThanOrEqual(3);
      expect(errors).toContain('Password must be at least 8 characters long');
      expect(errors).toContain('Password must contain at least one uppercase letter');
      expect(errors).toContain('Password must contain at least one number');
    });

    it('should accept valid password meeting all requirements', () => {
      const errors = validatePassword('SecureP1ss');
      expect(errors).toHaveLength(0);
    });

    it('should accept password with exactly 8 characters meeting all requirements', () => {
      const errors = validatePassword('Abcdef1x');
      expect(errors).toHaveLength(0);
    });

    it('should accept complex password', () => {
      const errors = validatePassword('MyStr0ng!P@ssw0rd');
      expect(errors).toHaveLength(0);
    });
  });
});
