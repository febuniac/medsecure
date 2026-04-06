const db = require('../models/db');
const { logger } = require('../utils/logger');

/**
 * BAA (Business Associate Agreement) Service
 *
 * Tracks Business Associate Agreements with third-party vendors
 * as required by HIPAA (45 CFR 164.502(e), 164.504(e)).
 *
 * Every covered entity must have a BAA in place with each business
 * associate that creates, receives, maintains, or transmits PHI.
 */

const BAA_STATUSES = ['active', 'expired', 'terminated', 'pending_renewal'];

class BaaAgreementService {
  /**
   * Create a new BAA agreement record.
   */
  static async create(data, user) {
    const now = new Date().toISOString();

    const agreement = {
      vendor_name: data.vendor_name,
      description: data.description || null,
      agreement_date: data.agreement_date,
      expiration_date: data.expiration_date,
      status: data.status || 'active',
      contract_reference: data.contract_reference || null,
      phi_types_shared: data.phi_types_shared || null,
      safeguards_required: data.safeguards_required || null,
      provider_id: user.provider_id,
      created_by: user.id,
      created_at: now,
      updated_at: now
    };

    const [inserted] = await db('baa_agreements').insert(agreement).returning('*');

    logger.info({
      type: 'BAA_AGREEMENT_CREATED',
      agreementId: inserted.id,
      vendorName: inserted.vendor_name,
      expirationDate: inserted.expiration_date,
      createdBy: user.id
    });

    return inserted;
  }

  /**
   * Get a BAA agreement by ID, scoped to provider.
   */
  static async getById(id, user) {
    const agreement = await db('baa_agreements')
      .where({ id, provider_id: user.provider_id })
      .first();
    return agreement || null;
  }

  /**
   * List BAA agreements with optional filters.
   */
  static async list(filters, user) {
    let query = db('baa_agreements').where({ provider_id: user.provider_id });

    if (filters.status) {
      query = query.where({ status: filters.status });
    }
    if (filters.vendor_name) {
      query = query.where('vendor_name', 'ilike', `%${filters.vendor_name}%`);
    }

    return query.orderBy('expiration_date', 'asc');
  }

  /**
   * Update a BAA agreement.
   */
  static async update(id, data, user) {
    const existing = await db('baa_agreements')
      .where({ id, provider_id: user.provider_id })
      .first();
    if (!existing) return null;

    const updates = {
      ...(data.vendor_name && { vendor_name: data.vendor_name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.agreement_date && { agreement_date: data.agreement_date }),
      ...(data.expiration_date && { expiration_date: data.expiration_date }),
      ...(data.status && { status: data.status }),
      ...(data.contract_reference !== undefined && { contract_reference: data.contract_reference }),
      ...(data.phi_types_shared !== undefined && { phi_types_shared: data.phi_types_shared }),
      ...(data.safeguards_required !== undefined && { safeguards_required: data.safeguards_required }),
      updated_at: new Date().toISOString()
    };

    const [updated] = await db('baa_agreements').where({ id }).update(updates).returning('*');

    logger.info({
      type: 'BAA_AGREEMENT_UPDATED',
      agreementId: id,
      changes: Object.keys(updates),
      updatedBy: user.id
    });

    return updated;
  }

  /**
   * Delete (soft-terminate) a BAA agreement.
   */
  static async terminate(id, user) {
    const existing = await db('baa_agreements')
      .where({ id, provider_id: user.provider_id })
      .first();
    if (!existing) return null;

    const [updated] = await db('baa_agreements').where({ id }).update({
      status: 'terminated',
      updated_at: new Date().toISOString()
    }).returning('*');

    logger.info({
      type: 'BAA_AGREEMENT_TERMINATED',
      agreementId: id,
      vendorName: existing.vendor_name,
      terminatedBy: user.id
    });

    return updated;
  }

  /**
   * Get all BAA agreements expiring within the given number of days.
   * Used for compliance alerts.
   */
  static async getExpiringSoon(user, withinDays = 30) {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + withinDays);

    return db('baa_agreements')
      .where({ provider_id: user.provider_id })
      .whereIn('status', ['active', 'pending_renewal'])
      .where('expiration_date', '>', now.toISOString().split('T')[0])
      .where('expiration_date', '<=', futureDate.toISOString().split('T')[0])
      .orderBy('expiration_date', 'asc');
  }

  /**
   * Get all expired BAA agreements that are still marked as active.
   * These represent compliance violations.
   */
  static async getExpired(user) {
    const now = new Date().toISOString().split('T')[0];
    return db('baa_agreements')
      .where({ provider_id: user.provider_id, status: 'active' })
      .where('expiration_date', '<', now)
      .orderBy('expiration_date', 'asc');
  }
}

module.exports = BaaAgreementService;
module.exports.BAA_STATUSES = BAA_STATUSES;
