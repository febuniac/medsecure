const db = require('../models/db');
const { logger } = require('../utils/logger');

/**
 * BAA (Business Associate Agreement) Service
 *
 * Tracks Business Associate Agreements per HIPAA requirements (45 CFR 164.502(e), 164.504(e)).
 * Covered entities must maintain BAAs with all business associates that create, receive,
 * maintain, or transmit PHI on their behalf.
 *
 * Features:
 * - CRUD operations for BAA agreements
 * - Expiration tracking and alerts
 * - Status management (active, expired, terminated, pending_renewal)
 * - Provider-scoped access control
 */

const BAA_STATUSES = ['draft', 'active', 'expired', 'terminated', 'pending_renewal'];

class BaaAgreementService {
  /**
   * Create a new BAA agreement record.
   */
  static async create(data, user) {
    const now = new Date().toISOString();

    const agreement = {
      vendor_name: data.vendor_name,
      vendor_contact_name: data.vendor_contact_name || null,
      vendor_contact_email: data.vendor_contact_email || null,
      description: data.description || null,
      agreement_date: data.agreement_date,
      expiration_date: data.expiration_date,
      status: data.status || 'active',
      phi_types_shared: JSON.stringify(data.phi_types_shared || []),
      services_provided: data.services_provided || null,
      termination_clause: data.termination_clause || null,
      created_by: user.id,
      provider_id: user.provider_id,
      created_at: now,
      updated_at: now
    };

    const [inserted] = await db('baa_agreements').insert(agreement).returning('*');

    logger.info({
      type: 'BAA_CREATED',
      agreementId: inserted.id,
      vendorName: inserted.vendor_name,
      status: inserted.status,
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

    if (agreement && agreement.phi_types_shared) {
      agreement.phi_types_shared = JSON.parse(agreement.phi_types_shared);
    }

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
    if (filters.expiring_before) {
      query = query.where('expiration_date', '<=', filters.expiring_before);
    }

    const agreements = await query.orderBy('expiration_date', 'asc');
    return agreements.map(a => {
      if (a.phi_types_shared) {
        a.phi_types_shared = JSON.parse(a.phi_types_shared);
      }
      return a;
    });
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
      ...(data.vendor_contact_name !== undefined && { vendor_contact_name: data.vendor_contact_name }),
      ...(data.vendor_contact_email !== undefined && { vendor_contact_email: data.vendor_contact_email }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.agreement_date && { agreement_date: data.agreement_date }),
      ...(data.expiration_date && { expiration_date: data.expiration_date }),
      ...(data.status && { status: data.status }),
      ...(data.phi_types_shared && { phi_types_shared: JSON.stringify(data.phi_types_shared) }),
      ...(data.services_provided !== undefined && { services_provided: data.services_provided }),
      ...(data.termination_clause !== undefined && { termination_clause: data.termination_clause }),
      updated_at: new Date().toISOString()
    };

    const [updated] = await db('baa_agreements').where({ id }).update(updates).returning('*');

    logger.info({
      type: 'BAA_UPDATED',
      agreementId: id,
      changes: Object.keys(updates),
      updatedBy: user.id
    });

    return updated;
  }

  /**
   * Delete (terminate) a BAA agreement.
   * Sets status to 'terminated' rather than hard-deleting for audit trail.
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
      type: 'BAA_TERMINATED',
      agreementId: id,
      vendorName: updated.vendor_name,
      terminatedBy: user.id
    });

    return updated;
  }

  /**
   * Get BAA agreements that are expired or expiring within a given number of days.
   */
  static async getExpiring(user, withinDays = 30) {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + withinDays);

    return db('baa_agreements')
      .where({ provider_id: user.provider_id })
      .whereIn('status', ['active', 'pending_renewal'])
      .where('expiration_date', '<=', futureDate.toISOString())
      .orderBy('expiration_date', 'asc');
  }

  /**
   * Get all expired BAA agreements that are still marked as active.
   */
  static async getExpired(user) {
    const now = new Date().toISOString();
    return db('baa_agreements')
      .where({ provider_id: user.provider_id, status: 'active' })
      .where('expiration_date', '<', now)
      .orderBy('expiration_date', 'asc');
  }

  /**
   * Get a summary of BAA agreements for compliance reporting.
   */
  static async getSummary(user) {
    const agreements = await db('baa_agreements')
      .where({ provider_id: user.provider_id })
      .orderBy('expiration_date', 'asc');

    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return {
      total: agreements.length,
      by_status: {
        draft: agreements.filter(a => a.status === 'draft').length,
        active: agreements.filter(a => a.status === 'active').length,
        expired: agreements.filter(a => a.status === 'expired').length,
        terminated: agreements.filter(a => a.status === 'terminated').length,
        pending_renewal: agreements.filter(a => a.status === 'pending_renewal').length
      },
      expiring_within_30_days: agreements.filter(a =>
        (a.status === 'active' || a.status === 'pending_renewal') &&
        new Date(a.expiration_date) <= thirtyDaysFromNow &&
        new Date(a.expiration_date) >= now
      ).length,
      expired_but_active: agreements.filter(a =>
        a.status === 'active' && new Date(a.expiration_date) < now
      ).length,
      agreements: agreements.map(a => ({
        id: a.id,
        vendor_name: a.vendor_name,
        status: a.status,
        agreement_date: a.agreement_date,
        expiration_date: a.expiration_date
      }))
    };
  }
}

module.exports = BaaAgreementService;
module.exports.BAA_STATUSES = BAA_STATUSES;
