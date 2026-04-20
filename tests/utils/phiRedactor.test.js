'use strict';

const {
  PHI_REPLACEMENT,
  redactString,
  redactObject,
  createRedactionFormat,
} = require('../../src/utils/phiRedactor');

describe('PHI Redactor', () => {
  describe('redactString', () => {
    it('should redact SSN in dashed format', () => {
      expect(redactString('Patient SSN is 123-45-6789')).toBe(
        `Patient SSN is ${PHI_REPLACEMENT}`
      );
    });

    it('should redact SSN without dashes', () => {
      expect(redactString('SSN: 123456789')).toBe(
        `SSN: ${PHI_REPLACEMENT}`
      );
    });

    it('should redact MRN patterns', () => {
      expect(redactString('MRN-123456')).toBe(PHI_REPLACEMENT);
      expect(redactString('MRN:789012')).toBe(PHI_REPLACEMENT);
      expect(redactString('MRN 345678')).toBe(PHI_REPLACEMENT);
    });

    it('should redact DOB patterns', () => {
      expect(redactString('DOB:01/15/1990')).toBe(PHI_REPLACEMENT);
      expect(redactString('date_of_birth: 1990-01-15')).toBe(PHI_REPLACEMENT);
    });

    it('should redact date formats (MM/DD/YYYY)', () => {
      expect(redactString('Visit on 01/15/2024')).toBe(
        `Visit on ${PHI_REPLACEMENT}`
      );
    });

    it('should redact ICD-10 diagnosis codes', () => {
      expect(redactString('Diagnosis: E11.65')).toBe(
        `Diagnosis: ${PHI_REPLACEMENT}`
      );
      expect(redactString('Code J45.20')).toBe(
        `Code ${PHI_REPLACEMENT}`
      );
    });

    it('should redact email addresses', () => {
      expect(redactString('Contact: patient@example.com')).toBe(
        `Contact: ${PHI_REPLACEMENT}`
      );
    });

    it('should redact phone numbers', () => {
      expect(redactString('Phone: (555) 123-4567')).toBe(
        `Phone: ${PHI_REPLACEMENT}`
      );
      expect(redactString('Call 555-123-4567')).toBe(
        `Call ${PHI_REPLACEMENT}`
      );
    });

    it('should redact multiple PHI patterns in one string', () => {
      const input = 'Patient SSN 123-45-6789, DOB:01/15/1990, MRN-123456';
      const result = redactString(input);
      expect(result).not.toContain('123-45-6789');
      expect(result).not.toContain('MRN-123456');
    });

    it('should return non-string values unchanged', () => {
      expect(redactString(42)).toBe(42);
      expect(redactString(null)).toBe(null);
      expect(redactString(undefined)).toBe(undefined);
    });

    it('should not redact safe strings', () => {
      expect(redactString('Server started on port 3000')).toBe(
        'Server started on port 3000'
      );
    });
  });

  describe('redactObject', () => {
    it('should redact known PHI field values completely', () => {
      const obj = {
        patient_name: 'John Doe',
        ssn: '123-45-6789',
        dob: '1990-01-15',
        diagnosis_code: 'E11.65',
        mrn: 'MRN-123456',
      };
      const result = redactObject(obj);
      expect(result.patient_name).toBe(PHI_REPLACEMENT);
      expect(result.ssn).toBe(PHI_REPLACEMENT);
      expect(result.dob).toBe(PHI_REPLACEMENT);
      expect(result.diagnosis_code).toBe(PHI_REPLACEMENT);
      expect(result.mrn).toBe(PHI_REPLACEMENT);
    });

    it('should redact nested PHI fields', () => {
      const obj = {
        patient: {
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
        },
      };
      const result = redactObject(obj);
      expect(result.patient.first_name).toBe(PHI_REPLACEMENT);
      expect(result.patient.last_name).toBe(PHI_REPLACEMENT);
      expect(result.patient.email).toBe(PHI_REPLACEMENT);
    });

    it('should apply pattern redaction to non-PHI fields containing PHI', () => {
      const obj = {
        message: 'Created patient with SSN 123-45-6789',
        action: 'lookup',
      };
      const result = redactObject(obj);
      expect(result.message).not.toContain('123-45-6789');
      expect(result.action).toBe('lookup');
    });

    it('should handle arrays with PHI', () => {
      const obj = {
        first_name: ['John', 'Jane'],
      };
      const result = redactObject(obj);
      expect(result.first_name).toEqual([PHI_REPLACEMENT, PHI_REPLACEMENT]);
    });

    it('should preserve non-PHI fields', () => {
      const obj = {
        type: 'HIPAA_AUDIT',
        method: 'GET',
        path: '/api/v1/patients',
        statusCode: 200,
        duration: 45,
      };
      const result = redactObject(obj);
      expect(result.type).toBe('HIPAA_AUDIT');
      expect(result.method).toBe('GET');
      expect(result.path).toBe('/api/v1/patients');
      expect(result.statusCode).toBe(200);
      expect(result.duration).toBe(45);
    });

    it('should handle null and undefined gracefully', () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });

    it('should redact PHI in deeply nested structures', () => {
      const obj = {
        data: {
          records: [
            { patient_name: 'John Doe', id: 1 },
            { patient_name: 'Jane Smith', id: 2 },
          ],
        },
      };
      const result = redactObject(obj);
      expect(result.data.records[0].patient_name).toBe(PHI_REPLACEMENT);
      expect(result.data.records[1].patient_name).toBe(PHI_REPLACEMENT);
      expect(result.data.records[0].id).toBe(1);
    });

    it('should redact numeric values in PHI fields', () => {
      const obj = { phone: 5551234567 };
      const result = redactObject(obj);
      expect(result.phone).toBe(PHI_REPLACEMENT);
    });

    it('should redact boolean values in PHI fields', () => {
      const obj = { ssn: true };
      const result = redactObject(obj);
      expect(result.ssn).toBe(PHI_REPLACEMENT);
    });
  });

  describe('createRedactionFormat', () => {
    let winston;

    beforeAll(() => {
      winston = require('winston');
    });

    it('should return a winston format transform', () => {
      const format = createRedactionFormat(winston);
      expect(format).toBeDefined();
      expect(typeof format.transform).toBe('function');
    });

    it('should redact PHI from winston log info objects', () => {
      const format = createRedactionFormat(winston);
      const info = {
        level: 'info',
        message: 'Patient created',
        patient_name: 'John Doe',
        ssn: '123-45-6789',
        [Symbol.for('level')]: 'info',
      };
      const result = format.transform(info);
      expect(result.patient_name).toBe(PHI_REPLACEMENT);
      expect(result.ssn).toBe(PHI_REPLACEMENT);
      expect(result.level).toBe('info');
      expect(result.message).toBe('Patient created');
      // Preserve winston internal symbols
      expect(result[Symbol.for('level')]).toBe('info');
    });

    it('should redact PHI patterns in message field', () => {
      const format = createRedactionFormat(winston);
      const info = {
        level: 'info',
        message: 'Error processing SSN 123-45-6789 for MRN-123456',
        [Symbol.for('level')]: 'info',
      };
      const result = format.transform(info);
      expect(result.message).not.toContain('123-45-6789');
      expect(result.message).not.toContain('MRN-123456');
    });
  });
});
