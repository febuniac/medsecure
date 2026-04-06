const Joi = require('joi');

describe('BAA Agreement API - Validation', () => {
  const createBaaSchema = Joi.object({
    vendor_name: Joi.string().min(2).max(255).required(),
    vendor_contact_name: Joi.string().max(255).optional(),
    vendor_contact_email: Joi.string().email().max(255).optional(),
    description: Joi.string().max(2000).optional(),
    agreement_date: Joi.date().iso().required(),
    expiration_date: Joi.date().iso().required(),
    status: Joi.string().valid('draft', 'active', 'expired', 'terminated', 'pending_renewal').default('active'),
    phi_types_shared: Joi.array().items(Joi.string()).default([]),
    services_provided: Joi.string().max(2000).optional(),
    termination_clause: Joi.string().max(2000).optional()
  });

  const updateBaaSchema = Joi.object({
    vendor_name: Joi.string().min(2).max(255).optional(),
    vendor_contact_name: Joi.string().max(255).allow(null).optional(),
    vendor_contact_email: Joi.string().email().max(255).allow(null).optional(),
    description: Joi.string().max(2000).allow(null).optional(),
    agreement_date: Joi.date().iso().optional(),
    expiration_date: Joi.date().iso().optional(),
    status: Joi.string().valid('draft', 'active', 'expired', 'terminated', 'pending_renewal').optional(),
    phi_types_shared: Joi.array().items(Joi.string()).optional(),
    services_provided: Joi.string().max(2000).allow(null).optional(),
    termination_clause: Joi.string().max(2000).allow(null).optional()
  }).min(1);

  describe('createBaaSchema', () => {
    test('accepts valid BAA agreement', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Cloud Health Inc.',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(error).toBeUndefined();
    });

    test('accepts full BAA agreement with all fields', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Cloud Health Inc.',
        vendor_contact_name: 'John Doe',
        vendor_contact_email: 'john@cloudhealth.com',
        description: 'Cloud storage provider for PHI',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z',
        status: 'active',
        phi_types_shared: ['medical_records', 'billing_info'],
        services_provided: 'Cloud storage and backup',
        termination_clause: '30-day written notice required'
      });
      expect(error).toBeUndefined();
    });

    test('rejects missing vendor_name', () => {
      const { error } = createBaaSchema.validate({
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('vendor_name');
    });

    test('rejects missing agreement_date', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('agreement_date');
    });

    test('rejects missing expiration_date', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15T00:00:00.000Z'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('expiration_date');
    });

    test('rejects vendor_name shorter than 2 characters', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'A',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(error).toBeDefined();
    });

    test('rejects invalid status', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z',
        status: 'invalid_status'
      });
      expect(error).toBeDefined();
    });

    test('rejects invalid email format', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z',
        vendor_contact_email: 'not-an-email'
      });
      expect(error).toBeDefined();
    });

    test('rejects invalid date format', () => {
      const { error } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: 'not-a-date',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(error).toBeDefined();
    });

    test('defaults status to active', () => {
      const { value } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(value.status).toBe('active');
    });

    test('defaults phi_types_shared to empty array', () => {
      const { value } = createBaaSchema.validate({
        vendor_name: 'Test Vendor',
        agreement_date: '2026-01-15T00:00:00.000Z',
        expiration_date: '2027-01-15T00:00:00.000Z'
      });
      expect(value.phi_types_shared).toEqual([]);
    });

    test('accepts all valid statuses', () => {
      const statuses = ['draft', 'active', 'expired', 'terminated', 'pending_renewal'];
      for (const status of statuses) {
        const { error } = createBaaSchema.validate({
          vendor_name: 'Test Vendor',
          agreement_date: '2026-01-15T00:00:00.000Z',
          expiration_date: '2027-01-15T00:00:00.000Z',
          status
        });
        expect(error).toBeUndefined();
      }
    });
  });

  describe('updateBaaSchema', () => {
    test('accepts valid partial update', () => {
      const { error } = updateBaaSchema.validate({ vendor_name: 'Updated Vendor' });
      expect(error).toBeUndefined();
    });

    test('accepts status update', () => {
      const { error } = updateBaaSchema.validate({ status: 'expired' });
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

    test('accepts multiple field updates', () => {
      const { error } = updateBaaSchema.validate({
        vendor_name: 'New Vendor Name',
        expiration_date: '2028-01-01T00:00:00.000Z',
        status: 'pending_renewal'
      });
      expect(error).toBeUndefined();
    });

    test('allows null for optional contact fields', () => {
      const { error } = updateBaaSchema.validate({
        vendor_contact_name: null,
        vendor_contact_email: null
      });
      expect(error).toBeUndefined();
    });

    test('rejects invalid email in update', () => {
      const { error } = updateBaaSchema.validate({
        vendor_contact_email: 'bad-email'
      });
      expect(error).toBeDefined();
    });
  });
});
