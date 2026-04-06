const Joi = require('joi');

describe('BAA Agreement API - Validation', () => {
  const createBaaSchema = Joi.object({
    vendor_name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(2000).optional(),
    agreement_date: Joi.date().iso().required(),
    expiration_date: Joi.date().iso().required(),
    status: Joi.string().valid('active', 'expired', 'terminated', 'pending_renewal').default('active'),
    contract_reference: Joi.string().max(500).optional(),
    phi_types_shared: Joi.array().items(Joi.string()).optional(),
    safeguards_required: Joi.string().max(5000).optional()
  });

  const updateBaaSchema = Joi.object({
    vendor_name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(2000).allow(null).optional(),
    agreement_date: Joi.date().iso().optional(),
    expiration_date: Joi.date().iso().optional(),
    status: Joi.string().valid('active', 'expired', 'terminated', 'pending_renewal').optional(),
    contract_reference: Joi.string().max(500).allow(null).optional(),
    phi_types_shared: Joi.array().items(Joi.string()).allow(null).optional(),
    safeguards_required: Joi.string().max(5000).allow(null).optional()
  }).min(1);

  describe('createBaaSchema', () => {
    test('accepts valid BAA agreement', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Cloud Storage Inc.',
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15'
      });
      expect(error).toBeUndefined();
    });

    test('accepts full BAA agreement with all optional fields', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Analytics Corp',
        description: 'Data analytics for patient outcomes',
        agreement_date: '2026-01-01',
        expiration_date: '2028-01-01',
        status: 'active',
        contract_reference: 'CONTRACT-2026-100',
        phi_types_shared: ['demographics', 'diagnosis_codes'],
        safeguards_required: 'AES-256 encryption at rest, TLS 1.3 in transit'
      });
      expect(error).toBeUndefined();
    });

    test('rejects missing vendor_name', () => {
      const { error } = createBaaSchema.validate({
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('vendor_name');
    });

    test('rejects missing agreement_date', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        expiration_date: '2027-01-15'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('agreement_date');
    });

    test('rejects missing expiration_date', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('expiration_date');
    });

    test('rejects invalid status', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15',
        status: 'invalid_status'
      });
      expect(error).toBeDefined();
    });

    test('defaults status to active', () => {
      const { value } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15'
      });
      expect(value.status).toBe('active');
    });

    test('rejects empty vendor_name', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: '',
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15'
      });
      expect(error).toBeDefined();
    });

    test('rejects invalid date format for agreement_date', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: 'not-a-date',
        expiration_date: '2027-01-15'
      });
      expect(error).toBeDefined();
    });

    test('accepts all valid statuses', () => {
      const statuses = ['active', 'expired', 'terminated', 'pending_renewal'];
      for (const status of statuses) {
        const { error } = createBaaSchema.validate({
          vendor_name: 'Test Vendor',
          agreement_date: '2026-01-15',
          expiration_date: '2027-01-15',
          status
        });
        expect(error).toBeUndefined();
      }
    });

    test('accepts phi_types_shared as array of strings', () => {
      const { error, value } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15',
        expiration_date: '2027-01-15',
        phi_types_shared: ['ssn', 'medical_records', 'billing_info']
      });
      expect(error).toBeUndefined();
      expect(value.phi_types_shared).toEqual(['ssn', 'medical_records', 'billing_info']);
    });
  });

  describe('updateBaaSchema', () => {
    test('accepts valid partial update', () => {
      const { error } = updateBaaSchema.validate({
        vendor_name: 'Updated Vendor Name'
      });
      expect(error).toBeUndefined();
    });

    test('rejects empty update', () => {
      const { error } = updateBaaSchema.validate({});
      expect(error).toBeDefined();
    });

    test('rejects invalid status', () => {
      const { error } = updateBaaSchema.validate({ status: 'invalid' });
      expect(error).toBeDefined();
    });

    test('accepts multiple fields update', () => {
      const { error } = updateBaaSchema.validate({
        vendor_name: 'New Name',
        expiration_date: '2028-06-01',
        status: 'pending_renewal'
      });
      expect(error).toBeUndefined();
    });

    test('allows null for nullable fields', () => {
      const { error } = updateBaaSchema.validate({
        description: null,
        contract_reference: null
      });
      expect(error).toBeUndefined();
    });
  });
});
