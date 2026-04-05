const router = require('express').Router();
const Joi = require('joi');
const BreachNotificationService = require('../services/breachNotificationService');

// --- Validation Schemas ---

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

const reportToHHSSchema = Joi.object({
  report_date: Joi.date().iso().optional(),
  reference_number: Joi.string().max(255).optional()
});

// --- Helper ---

function validate(schema, data) {
  const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map(d => d.message);
    return { error: details };
  }
  return { value };
}

// --- Routes ---

/**
 * POST /api/v1/breach-notifications
 * Report a new breach incident.
 */
router.post('/', async (req, res) => {
  try {
    const { error, value } = validate(reportBreachSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const breach = await BreachNotificationService.reportBreach(value, req.user);
    res.status(201).json(breach);
  } catch (err) {
    res.status(500).json({ error: 'Failed to report breach', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications
 * List all breach incidents for the provider.
 */
router.get('/', async (req, res) => {
  try {
    const breaches = await BreachNotificationService.list(req.query, req.user);
    res.json(breaches);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list breaches', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications/overdue
 * Get breaches past the 60-day notification deadline.
 */
router.get('/overdue', async (req, res) => {
  try {
    const breaches = await BreachNotificationService.getOverdueBreaches(req.user);
    res.json(breaches);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get overdue breaches', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications/approaching-deadline
 * Get breaches approaching the notification deadline.
 */
router.get('/approaching-deadline', async (req, res) => {
  try {
    const withinDays = parseInt(req.query.within_days) || 14;
    const breaches = await BreachNotificationService.getApproachingDeadlineBreaches(req.user, withinDays);
    res.json(breaches);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get approaching deadline breaches', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications/annual-summary/:year
 * Get annual breach summary for HHS reporting.
 */
router.get('/annual-summary/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    const summary = await BreachNotificationService.getAnnualSummary(year, req.user);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get annual summary', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications/:id
 * Get a specific breach incident.
 */
router.get('/:id', async (req, res) => {
  try {
    const breach = await BreachNotificationService.getById(req.params.id, req.user);
    if (!breach) return res.status(404).json({ error: 'Breach not found' });
    res.json(breach);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get breach', message: err.message });
  }
});

/**
 * PUT /api/v1/breach-notifications/:id
 * Update a breach incident.
 */
router.put('/:id', async (req, res) => {
  try {
    const { error, value } = validate(updateBreachSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const breach = await BreachNotificationService.updateBreach(req.params.id, value, req.user);
    if (!breach) return res.status(404).json({ error: 'Breach not found' });
    res.json(breach);
  } catch (err) {
    if (err.message.includes('Invalid status transition')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update breach', message: err.message });
  }
});

/**
 * POST /api/v1/breach-notifications/:id/risk-assessment
 * Perform four-factor risk assessment for a breach.
 */
router.post('/:id/risk-assessment', async (req, res) => {
  try {
    const { error, value } = validate(riskAssessmentSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const assessment = await BreachNotificationService.performRiskAssessment(req.params.id, value, req.user);
    if (!assessment) return res.status(404).json({ error: 'Breach not found' });
    res.status(201).json(assessment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to perform risk assessment', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications/:id/risk-assessment
 * Get risk assessment for a breach.
 */
router.get('/:id/risk-assessment', async (req, res) => {
  try {
    const assessment = await BreachNotificationService.getRiskAssessment(req.params.id, req.user);
    if (!assessment) return res.status(404).json({ error: 'Breach or assessment not found' });
    res.json(assessment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get risk assessment', message: err.message });
  }
});

/**
 * POST /api/v1/breach-notifications/:id/notify
 * Send a notification for a breach.
 */
router.post('/:id/notify', async (req, res) => {
  try {
    const { error, value } = validate(sendNotificationSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const notification = await BreachNotificationService.sendNotification(req.params.id, value, req.user);
    if (!notification) return res.status(404).json({ error: 'Breach not found' });
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send notification', message: err.message });
  }
});

/**
 * GET /api/v1/breach-notifications/:id/notifications
 * Get all notifications for a breach.
 */
router.get('/:id/notifications', async (req, res) => {
  try {
    const notifications = await BreachNotificationService.getNotifications(req.params.id, req.user);
    if (!notifications) return res.status(404).json({ error: 'Breach not found' });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notifications', message: err.message });
  }
});

/**
 * POST /api/v1/breach-notifications/:id/report-hhs
 * Mark a breach as reported to HHS.
 */
router.post('/:id/report-hhs', async (req, res) => {
  try {
    const { error, value } = validate(reportToHHSSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const breach = await BreachNotificationService.markAsReported(req.params.id, value, req.user);
    if (!breach) return res.status(404).json({ error: 'Breach not found' });
    res.json(breach);
  } catch (err) {
    res.status(500).json({ error: 'Failed to report to HHS', message: err.message });
  }
});

module.exports = router;
