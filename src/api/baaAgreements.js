const router = require('express').Router();
const Joi = require('joi');
const BaaAgreementService = require('../services/baaAgreementService');

// --- Validation Schemas ---

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
 * GET /api/v1/baa-agreements/expiring-soon
 * Get BAA agreements expiring within N days.
 */
router.get('/expiring-soon', async (req, res) => {
  try {
    const withinDays = parseInt(req.query.within_days) || 30;
    const agreements = await BaaAgreementService.getExpiringSoon(req.user, withinDays);
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
 * DELETE /api/v1/baa-agreements/:id
 * Terminate a BAA agreement.
 */
router.delete('/:id', async (req, res) => {
  try {
    const agreement = await BaaAgreementService.terminate(req.params.id, req.user);
    if (!agreement) return res.status(404).json({ error: 'BAA agreement not found' });
    res.json({ message: 'BAA agreement terminated', agreement });
  } catch (err) {
    res.status(500).json({ error: 'Failed to terminate BAA agreement', message: err.message });
  }
});

module.exports = router;
