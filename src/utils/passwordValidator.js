const PASSWORD_MIN_LENGTH = 8;

function validatePassword(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return ['Password is required'];
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return errors;
}

module.exports = { validatePassword, PASSWORD_MIN_LENGTH };
