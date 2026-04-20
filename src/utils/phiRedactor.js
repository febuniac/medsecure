'use strict';

const PHI_REPLACEMENT = '[REDACTED]';

// PHI pattern definitions for identification and redaction
const PHI_PATTERNS = [
  // SSN: 123-45-6789 or 123456789
  { name: 'ssn', pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g },
  // MRN: common formats like MRN-123456, MRN:123456, MRN 123456, or standalone MRN references
  { name: 'mrn', pattern: /\bMRN[-:\s]?\d{4,10}\b/gi },
  // Date of birth patterns: DOB, date_of_birth, birthdate, dob fields
  { name: 'dob', pattern: /\b(?:DOB|date_of_birth|birthdate|birth_date)[-:\s]*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/gi },
  // Date formats that appear near PHI context (MM/DD/YYYY, YYYY-MM-DD)
  { name: 'date', pattern: /\b(?:0[1-9]|1[0-2])[/-](?:0[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g },
  // ICD-10 diagnosis codes: letter followed by digits and optional decimal
  { name: 'diagnosis_code', pattern: /\b[A-TV-Z]\d{2,3}(?:\.\d{1,4})?\b/g },
  // Email addresses
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  // Phone numbers: (123) 456-7890, 123-456-7890
  { name: 'phone', pattern: /(?:\(\d{3}\)\s?|\b\d{3}[-.])\d{3}[-.]?\d{4}\b/g },
  // US ZIP codes (5 or 9 digit)
  { name: 'zip', pattern: /\b\d{5}(?:-\d{4})?\b/g },
];

// Fields known to contain PHI that should always be redacted
const PHI_FIELDS = new Set([
  'ssn', 'social_security', 'social_security_number',
  'mrn', 'medical_record_number',
  'patient_name', 'patientName', 'first_name', 'firstName',
  'last_name', 'lastName', 'full_name', 'fullName',
  'dob', 'date_of_birth', 'dateOfBirth', 'birthdate', 'birth_date',
  'diagnosis', 'diagnosis_code', 'diagnosisCode', 'icd_code', 'icdCode',
  'address', 'street_address', 'streetAddress',
  'email', 'patient_email', 'patientEmail',
  'phone', 'phone_number', 'phoneNumber', 'patient_phone',
  'insurance_id', 'insuranceId', 'policy_number', 'policyNumber',
  'ssn_encrypted',
]);

/**
 * Redact PHI patterns from a string value.
 * @param {string} value - The string to redact
 * @returns {string} The redacted string
 */
function redactString(value) {
  if (typeof value !== 'string') return value;

  let redacted = value;
  for (const { pattern } of PHI_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, PHI_REPLACEMENT);
  }
  return redacted;
}

/**
 * Deep-redact PHI from a log object. Recursively walks the object and:
 * - Redacts any field whose key is in PHI_FIELDS
 * - Applies pattern-based redaction to all string values
 *
 * @param {*} obj - The value to redact (object, array, or primitive)
 * @param {boolean} [isPhiField=false] - Whether the current value belongs to a PHI field
 * @returns {*} A new object/value with PHI redacted
 */
function redactObject(obj, isPhiField = false) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    if (isPhiField) return PHI_REPLACEMENT;
    return redactString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    if (isPhiField) return PHI_REPLACEMENT;
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, isPhiField));
  }

  if (typeof obj === 'object') {
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      const fieldIsPhi = PHI_FIELDS.has(key);
      redacted[key] = redactObject(value, fieldIsPhi);
    }
    return redacted;
  }

  return obj;
}

/**
 * Create a Winston format that redacts PHI from log entries.
 * This format should be applied to transports that send logs to
 * external services (e.g., Datadog, console in non-HIPAA environments).
 *
 * @returns {object} A Winston format transform
 */
function createRedactionFormat(winston) {
  return winston.format((info) => {
    const redacted = redactObject(info);
    // Preserve Winston internal symbols
    const symbols = Object.getOwnPropertySymbols(info);
    for (const sym of symbols) {
      redacted[sym] = info[sym];
    }
    return redacted;
  })();
}

module.exports = {
  PHI_REPLACEMENT,
  PHI_PATTERNS,
  PHI_FIELDS,
  redactString,
  redactObject,
  createRedactionFormat,
};
