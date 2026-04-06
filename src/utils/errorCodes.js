/**
 * Structured error codes for MedSecure API.
 *
 * Each error code maps to a default HTTP status and human-readable message.
 * Client apps should switch on `error.code` rather than parsing `error.message`.
 */

const ErrorCodes = Object.freeze({
  // --- Authentication / Authorization ---
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCESS_DENIED: 'ACCESS_DENIED',
  ADMIN_ONLY: 'ADMIN_ONLY',

  // --- Validation ---
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_YEAR: 'INVALID_YEAR',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',

  // --- Resource Not Found ---
  PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
  BAA_NOT_FOUND: 'BAA_NOT_FOUND',
  BREACH_NOT_FOUND: 'BREACH_NOT_FOUND',
  RISK_ASSESSMENT_NOT_FOUND: 'RISK_ASSESSMENT_NOT_FOUND',
  PRESCRIPTION_NOT_FOUND: 'PRESCRIPTION_NOT_FOUND',

  // --- Conflict ---
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  HOLIDAY_CONFLICT: 'HOLIDAY_CONFLICT',
  DRUG_INTERACTION_FOUND: 'DRUG_INTERACTION_FOUND',

  // --- Password ---
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',

  // --- Server ---
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  LOGIN_FAILED: 'LOGIN_FAILED',
});

/**
 * Default HTTP status codes for each error code.
 */
const ErrorStatusMap = Object.freeze({
  [ErrorCodes.AUTHENTICATION_REQUIRED]: 401,
  [ErrorCodes.INVALID_TOKEN]: 401,
  [ErrorCodes.INVALID_CREDENTIALS]: 401,
  [ErrorCodes.ACCESS_DENIED]: 403,
  [ErrorCodes.ADMIN_ONLY]: 403,

  [ErrorCodes.VALIDATION_FAILED]: 400,
  [ErrorCodes.MISSING_REQUIRED_FIELDS]: 400,
  [ErrorCodes.INVALID_INPUT]: 400,
  [ErrorCodes.INVALID_YEAR]: 400,
  [ErrorCodes.INVALID_STATUS_TRANSITION]: 400,

  [ErrorCodes.PATIENT_NOT_FOUND]: 404,
  [ErrorCodes.RECORD_NOT_FOUND]: 404,
  [ErrorCodes.APPOINTMENT_NOT_FOUND]: 404,
  [ErrorCodes.ASSIGNMENT_NOT_FOUND]: 404,
  [ErrorCodes.BAA_NOT_FOUND]: 404,
  [ErrorCodes.BREACH_NOT_FOUND]: 404,
  [ErrorCodes.RISK_ASSESSMENT_NOT_FOUND]: 404,
  [ErrorCodes.PRESCRIPTION_NOT_FOUND]: 404,

  [ErrorCodes.EMAIL_ALREADY_EXISTS]: 409,
  [ErrorCodes.HOLIDAY_CONFLICT]: 409,
  [ErrorCodes.DRUG_INTERACTION_FOUND]: 409,

  [ErrorCodes.PASSWORD_TOO_WEAK]: 400,

  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.REGISTRATION_FAILED]: 500,
  [ErrorCodes.LOGIN_FAILED]: 500,
});

/**
 * Application error with a structured error code.
 */
class AppError extends Error {
  /**
   * @param {string} code   - One of ErrorCodes.*
   * @param {string} message - Human-readable description
   * @param {object} [options]
   * @param {number} [options.status]  - Override the default HTTP status
   * @param {*}      [options.details] - Additional payload (validation errors, etc.)
   */
  constructor(code, message, { status, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status || ErrorStatusMap[code] || 500;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Build a structured JSON error body.
 *
 * @param {string} code
 * @param {string} message
 * @param {*} [details]
 * @returns {{ error: { code: string, message: string, details?: * } }}
 */
function formatError(code, message, details) {
  const body = { error: { code, message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  return body;
}

/**
 * Build a structured error response from an AppError or a plain Error.
 *
 * @param {Error} err
 * @returns {{ status: number, body: object }}
 */
function formatErrorResponse(err) {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: formatError(err.code, err.message, err.details),
    };
  }

  // Legacy errors that set .status and .code
  if (err.code && ErrorStatusMap[err.code]) {
    return {
      status: err.status || ErrorStatusMap[err.code],
      body: formatError(err.code, err.message),
    };
  }

  // Fallback for unstructured errors
  const status = err.status || 500;
  return {
    status,
    body: formatError(ErrorCodes.INTERNAL_ERROR, err.message || 'Internal server error'),
  };
}

/**
 * Build a sanitized error response safe for patient-related endpoints.
 *
 * Known AppError instances (validation, not-found, auth, etc.) are returned
 * with their original code and message because they never contain PHI.
 * Unstructured / unexpected errors are replaced with a generic message to
 * prevent patient data from leaking in error responses (HIPAA).
 *
 * @param {Error} err
 * @returns {{ status: number, body: object }}
 */
function sanitizePatientError(err) {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: formatError(err.code, err.message, err.details),
    };
  }

  // Legacy errors that set .status and .code
  if (err.code && ErrorStatusMap[err.code]) {
    return {
      status: err.status || ErrorStatusMap[err.code],
      body: formatError(err.code, err.message),
    };
  }

  // For any unstructured error, return a generic message to avoid leaking PHI
  return {
    status: 500,
    body: formatError(ErrorCodes.INTERNAL_ERROR, 'Failed to process patient record'),
  };
}

module.exports = {
  ErrorCodes,
  ErrorStatusMap,
  AppError,
  formatError,
  formatErrorResponse,
  sanitizePatientError,
};
