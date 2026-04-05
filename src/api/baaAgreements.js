const router = require('express').Router();
const Joi = require('joi');
const BaaAgreementService = require('../services/baaAgreementService');

// --- Validation Schemas ---

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
 * POST /api/v1/baa-agreements
 * Create a new BAA agreement.
 */
router.post('/', async (req, res) => {
  try {
    const { error, value } = validate(createBaaSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const agreement = await BaaAgreementService.create(value, req.user);
    res.status(201).json(agreement);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create BAA agreement', message: err.message });
  }
});

/**
 * GET /api/v1/baa-agreements
 * List all BAA agreements for the provider.
 */
router.get('/', async (req, res) => {
  try {
    const agreements = await BaaAgreementService.list(req.query, req.user);
    res.json(agreements);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list BAA agreements', message: err.message });
  }
});

/**
 * GET /api/v1/baa-agreements/expiring
 * Get BAA agreements expiring within N days.
 */
router.get('/expiring', async (req, res) => {
  try {
    const withinDays = parseInt(req.query.within_days) || 30;
    const agreements = await BaaAgreementService.getExpiring(req.user, withinDays);
    res.json(agreements);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get expiring BAA agreements', message: err.message });
  }
});

/**
 * GET /api/v1/baa-agreements/expired
 * Get BAA agreements that are expired but still marked active.
 */
router.get('/expired', async (req, res) => {
  try {
    const agreements = await BaaAgreementService.getExpired(req.user);
    res.json(agreements);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get expired BAA agreements', message: err.message });
  }
});

/**
 * GET /api/v1/baa-agreements/summary
 * Get a compliance summary of all BAA agreements.
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await BaaAgreementService.getSummary(req.user);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get BAA summary', message: err.message });
  }
});

/**
 * GET /api/v1/baa-agreements/:id
 * Get a specific BAA agreement.
 */
router.get('/:id', async (req, res) => {
  try {
    const agreement = await BaaAgreementService.getById(req.params.id, req.user);
    if (!agreement) return res.status(404).json({ error: 'BAA agreement not found' });
    res.json(agreement);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get BAA agreement', message: err.message });
  }
});

/**
 * PUT /api/v1/baa-agreements/:id
 * Update a BAA agreement.
 */
router.put('/:id', async (req, res) => {
  try {
    const { error, value } = validate(updateBaaSchema, req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error });

    const agreement = await BaaAgreementService.update(req.params.id, value, req.user);
    if (!agreement) return res.status(404).json({ error: 'BAA agreement not found' });
    res.json(agreement);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update BAA agreement', message: err.message });
  }
});

/**
 * POST /api/v1/baa-agreements/:id/terminate
 * Terminate a BAA agreement (soft delete).
 */
router.post('/:id/terminate', async (req, res) => {
  try {
    const agreement = await BaaAgreementService.terminate(req.params.id, req.user);
    if (!agreement) return res.status(404).json({ error: 'BAA agreement not found' });
    res.json(agreement);
  } catch (err) {
    res.status(500).json({ error: 'Failed to terminate BAA agreement', message: err.message });
  }
});

module.exports = router;
