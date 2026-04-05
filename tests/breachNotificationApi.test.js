const Joi = require('joi');

// Test the validation schemas and API route logic independently

describe('Breach Notification API - Validation', () => {
  // Replicate schemas from the API file for unit testing
  const reportBreachSchema = Joi.object({
    title: Joi.string().min(3).max(255).required(),
    description: Joi.string().min(10).max(5000).required(),
    breach_type: Joi.string().valid(
      'unauthorized_access', 'unauthorized_disclosure', 'loss', 'theft',
      'improper_disposal', 'hacking', 'other'
    ).required(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    phi_types_involved: Joi.array().items(Joi.string()).default([]),
    individuals_affected_count: Joi.number().integer().min(0).default(0),
    discovery_date: Joi.date().iso().optional(),
    location_of_breach: Joi.string().max(500).optional(),
    source_of_breach: Joi.string().max(500).optional(),
    corrective_actions: Joi.string().max(5000).optional()
  });

  const updateBreachSchema = Joi.object({
    title: Joi.string().min(3).max(255).optional(),
    description: Joi.string().min(10).max(5000).optional(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    status: Joi.string().valid(
      'detected', 'investigating', 'confirmed', 'notifying', 'reported', 'closed'
    ).optional(),
    individuals_affected_count: Joi.number().integer().min(0).optional(),
    corrective_actions: Joi.string().max(5000).optional(),
    phi_types_involved: Joi.array().items(Joi.string()).optional()
  }).min(1);

  const riskAssessmentSchema = Joi.object({
    phi_nature_extent: Joi.string().valid('minimal', 'moderate', 'extensive', 'comprehensive').required(),
    unauthorized_recipient: Joi.string().valid('known_internal', 'known_external', 'unknown', 'malicious_actor').required(),
    phi_acquired_or_viewed: Joi.string().valid('not_accessed', 'viewed_only', 'acquired', 'exfiltrated').required(),
    mitigation_extent: Joi.string().valid('fully_mitigated', 'substantially_mitigated', 'partially_mitigated', 'not_mitigated').required(),
    overall_risk_level: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    notes: Joi.string().max(5000).optional()
  });

  const sendNotificationSchema = Joi.object({
    notification_type: Joi.string().valid('individual', 'hhs', 'media', 'state_attorney_general').required(),
    recipient_type: Joi.string().valid('patient', 'hhs', 'media', 'state_ag', 'next_of_kin').required(),
    recipient_identifier: Joi.string().max(500).required(),
    subject: Joi.string().max(500).required(),
    message_body: Joi.string().max(10000).required(),
    delivery_method: Joi.string().valid('email', 'postal_mail', 'phone', 'hhs_portal', 'press_release', 'website').default('email'),
    scheduled_date: Joi.date().iso().optional()
  });

  describe('reportBreachSchema', () => {
    test('accepts valid breach report', () => {
      const { error } = reportBreachSchema.validate({
        title: 'Test Breach',
        description: 'A test breach incident that needs attention',
        breach_type: 'unauthorized_access',
        severity: 'high',
        individuals_affected_count: 100
      });
      expect(error).toBeUndefined();
    });

    test('rejects missing title', () => {
      const { error } = reportBreachSchema.validate({
        description: 'A test breach incident that needs attention',
        breach_type: 'unauthorized_access'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('title');
    });

    test('rejects missing description', () => {
      const { error } = reportBreachSchema.validate({
        title: 'Test',
        breach_type: 'unauthorized_access'
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('description');
    });

    test('rejects invalid breach_type', () => {
      const { error } = reportBreachSchema.validate({
        title: 'Test Breach',
        description: 'A test breach incident that needs attention',
        breach_type: 'invalid_type'
      });
      expect(error).toBeDefined();
    });

    test('rejects invalid severity', () => {
      const { error } = reportBreachSchema.validate({
        title: 'Test Breach',
        description: 'A test breach incident that needs attention',
        breach_type: 'hacking',
        severity: 'extreme'
      });
      expect(error).toBeDefined();
    });

    test('rejects negative individuals_affected_count', () => {
      const { error } = reportBreachSchema.validate({
        title: 'Test Breach',
        description: 'A test breach incident that needs attention',
        breach_type: 'hacking',
        individuals_affected_count: -1
      });
      expect(error).toBeDefined();
    });

    test('defaults severity to medium', () => {
      const { value } = reportBreachSchema.validate({
        title: 'Test Breach',
        description: 'A test breach incident that needs attention',
        breach_type: 'hacking'
      });
      expect(value.severity).toBe('medium');
    });

    test('defaults individuals_affected_count to 0', () => {
      const { value } = reportBreachSchema.validate({
        title: 'Test Breach',
        description: 'A test breach incident that needs attention',
        breach_type: 'theft'
      });
      expect(value.individuals_affected_count).toBe(0);
    });

    test('accepts all valid breach types', () => {
      const types = ['unauthorized_access', 'unauthorized_disclosure', 'loss', 'theft', 'improper_disposal', 'hacking', 'other'];
      for (const breach_type of types) {
        const { error } = reportBreachSchema.validate({
          title: 'Test',
          description: 'A valid description for testing',
          breach_type
        });
        expect(error).toBeUndefined();
      }
    });
  });

  describe('updateBreachSchema', () => {
    test('accepts valid status update', () => {
      const { error } = updateBreachSchema.validate({ status: 'investigating' });
      expect(error).toBeUndefined();
    });

    test('rejects empty update', () => {
      const { error } = updateBreachSchema.validate({});
      expect(error).toBeDefined();
    });

    test('rejects invalid status', () => {
      const { error } = updateBreachSchema.validate({ status: 'invalid' });
      expect(error).toBeDefined();
    });

    test('accepts partial updates', () => {
      const { error } = updateBreachSchema.validate({
        title: 'Updated Title',
        severity: 'critical'
      });
      expect(error).toBeUndefined();
    });
  });

  describe('riskAssessmentSchema', () => {
    test('accepts valid four-factor assessment', () => {
      const { error } = riskAssessmentSchema.validate({
        phi_nature_extent: 'moderate',
        unauthorized_recipient: 'known_external',
        phi_acquired_or_viewed: 'viewed_only',
        mitigation_extent: 'substantially_mitigated'
      });
      expect(error).toBeUndefined();
    });

    test('rejects missing required fields', () => {
      const { error } = riskAssessmentSchema.validate({
        phi_nature_extent: 'moderate'
      });
      expect(error).toBeDefined();
    });

    test('accepts optional overall_risk_level override', () => {
      const { error, value } = riskAssessmentSchema.validate({
        phi_nature_extent: 'extensive',
        unauthorized_recipient: 'unknown',
        phi_acquired_or_viewed: 'acquired',
        mitigation_extent: 'not_mitigated',
        overall_risk_level: 'critical'
      });
      expect(error).toBeUndefined();
      expect(value.overall_risk_level).toBe('critical');
    });
  });

  describe('sendNotificationSchema', () => {
    test('accepts valid notification', () => {
      const { error } = sendNotificationSchema.validate({
        notification_type: 'individual',
        recipient_type: 'patient',
        recipient_identifier: 'patient@email.com',
        subject: 'Breach Notification',
        message_body: 'We are writing to inform you of a data breach.'
      });
      expect(error).toBeUndefined();
    });

    test('rejects invalid notification_type', () => {
      const { error } = sendNotificationSchema.validate({
        notification_type: 'invalid',
        recipient_type: 'patient',
        recipient_identifier: 'patient@email.com',
        subject: 'Test',
        message_body: 'Test message'
      });
      expect(error).toBeDefined();
    });

    test('defaults delivery_method to email', () => {
      const { value } = sendNotificationSchema.validate({
        notification_type: 'individual',
        recipient_type: 'patient',
        recipient_identifier: 'patient@email.com',
        subject: 'Test',
        message_body: 'Test message'
      });
      expect(value.delivery_method).toBe('email');
    });

    test('accepts all valid delivery methods', () => {
      const methods = ['email', 'postal_mail', 'phone', 'hhs_portal', 'press_release', 'website'];
      for (const delivery_method of methods) {
        const { error } = sendNotificationSchema.validate({
          notification_type: 'individual',
          recipient_type: 'patient',
          recipient_identifier: 'test@email.com',
          subject: 'Test',
          message_body: 'Test message body',
          delivery_method
        });
        expect(error).toBeUndefined();
      }
    });

    test('accepts all valid notification types', () => {
      const types = ['individual', 'hhs', 'media', 'state_attorney_general'];
      for (const notification_type of types) {
        const { error } = sendNotificationSchema.validate({
          notification_type,
          recipient_type: 'patient',
          recipient_identifier: 'test@email.com',
          subject: 'Test',
          message_body: 'Test message body'
        });
        expect(error).toBeUndefined();
      }
    });
  });
});
