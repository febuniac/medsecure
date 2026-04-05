const db = require('../models/db');
const { logger } = require('../utils/logger');

/**
 * HIPAA Breach Notification Service
 *
 * Manages the full lifecycle of breach incidents per 45 CFR 164.400-414:
 * - Breach detection and reporting
 * - Risk assessment (four-factor analysis)
 * - Notification to individuals, HHS, and media (when >= 500 affected)
 * - 60-day reporting deadline tracking
 * - Breach log maintenance for annual HHS submission
 */

const BREACH_STATUSES = ['detected', 'investigating', 'confirmed', 'notifying', 'reported', 'closed'];
const BREACH_SEVERITY = ['low', 'medium', 'high', 'critical'];
const NOTIFICATION_TYPES = ['individual', 'hhs', 'media', 'state_attorney_general'];
const NOTIFICATION_STATUSES = ['pending', 'sent', 'delivered', 'failed'];

// HIPAA requires notification within 60 calendar days of discovery
const HIPAA_NOTIFICATION_DEADLINE_DAYS = 60;
// Threshold for media and HHS immediate notification
const LARGE_BREACH_THRESHOLD = 500;

class BreachNotificationService {
  /**
   * Report a new breach incident.
   * Starts the 60-day clock per HIPAA Breach Notification Rule.
   */
  static async reportBreach(data, reportedBy) {
    const now = new Date();
    const deadlineDate = new Date(now);
    deadlineDate.setDate(deadlineDate.getDate() + HIPAA_NOTIFICATION_DEADLINE_DAYS);

    const breach = {
      title: data.title,
      description: data.description,
      breach_type: data.breach_type,
      severity: data.severity || 'medium',
      phi_types_involved: JSON.stringify(data.phi_types_involved || []),
      individuals_affected_count: data.individuals_affected_count || 0,
      discovery_date: data.discovery_date || now.toISOString(),
      notification_deadline: deadlineDate.toISOString(),
      status: 'detected',
      reported_by: reportedBy.id,
      provider_id: reportedBy.provider_id,
      location_of_breach: data.location_of_breach || null,
      source_of_breach: data.source_of_breach || null,
      corrective_actions: data.corrective_actions || null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const [inserted] = await db('breach_incidents').insert(breach).returning('*');

    logger.info({
      type: 'BREACH_REPORTED',
      breachId: inserted.id,
      severity: inserted.severity,
      affectedCount: inserted.individuals_affected_count,
      deadline: inserted.notification_deadline,
      reportedBy: reportedBy.id
    });

    // Auto-escalate large breaches
    if (inserted.individuals_affected_count >= LARGE_BREACH_THRESHOLD) {
      await this._scheduleLargeBreachNotifications(inserted);
    }

    return inserted;
  }

  /**
   * Get a breach incident by ID.
   */
  static async getById(id, user) {
    const breach = await db('breach_incidents').where({ id, provider_id: user.provider_id }).first();
    if (breach && breach.phi_types_involved) {
      breach.phi_types_involved = JSON.parse(breach.phi_types_involved);
    }
    return breach || null;
  }

  /**
   * List breach incidents with optional filters.
   */
  static async list(filters, user) {
    let query = db('breach_incidents').where({ provider_id: user.provider_id });

    if (filters.status) {
      query = query.where({ status: filters.status });
    }
    if (filters.severity) {
      query = query.where({ severity: filters.severity });
    }
    if (filters.from_date) {
      query = query.where('discovery_date', '>=', filters.from_date);
    }
    if (filters.to_date) {
      query = query.where('discovery_date', '<=', filters.to_date);
    }

    const breaches = await query.orderBy('created_at', 'desc');
    return breaches.map(b => {
      if (b.phi_types_involved) {
        b.phi_types_involved = JSON.parse(b.phi_types_involved);
      }
      return b;
    });
  }

  /**
   * Update breach status and details.
   * Enforces valid status transitions.
   */
  static async updateBreach(id, data, user) {
    const existing = await db('breach_incidents').where({ id, provider_id: user.provider_id }).first();
    if (!existing) return null;

    if (data.status) {
      const currentIdx = BREACH_STATUSES.indexOf(existing.status);
      const newIdx = BREACH_STATUSES.indexOf(data.status);
      if (newIdx < currentIdx) {
        throw new Error(`Invalid status transition from '${existing.status}' to '${data.status}'`);
      }
    }

    const updates = {
      ...(data.title && { title: data.title }),
      ...(data.description && { description: data.description }),
      ...(data.severity && { severity: data.severity }),
      ...(data.status && { status: data.status }),
      ...(data.individuals_affected_count !== undefined && { individuals_affected_count: data.individuals_affected_count }),
      ...(data.corrective_actions && { corrective_actions: data.corrective_actions }),
      ...(data.phi_types_involved && { phi_types_involved: JSON.stringify(data.phi_types_involved) }),
      updated_at: new Date().toISOString()
    };

    const [updated] = await db('breach_incidents').where({ id }).update(updates).returning('*');

    logger.info({
      type: 'BREACH_UPDATED',
      breachId: id,
      changes: Object.keys(updates),
      updatedBy: user.id
    });

    return updated;
  }

  /**
   * Perform the four-factor risk assessment per 45 CFR 164.402.
   *
   * Factors:
   * 1. Nature and extent of PHI involved
   * 2. Unauthorized person who used/accessed PHI
   * 3. Whether PHI was actually acquired or viewed
   * 4. Extent to which risk has been mitigated
   */
  static async performRiskAssessment(breachId, assessment, user) {
    const breach = await db('breach_incidents').where({ id: breachId, provider_id: user.provider_id }).first();
    if (!breach) return null;

    const riskRecord = {
      breach_id: breachId,
      phi_nature_extent: assessment.phi_nature_extent,
      unauthorized_recipient: assessment.unauthorized_recipient,
      phi_acquired_or_viewed: assessment.phi_acquired_or_viewed,
      mitigation_extent: assessment.mitigation_extent,
      overall_risk_level: assessment.overall_risk_level || this._calculateRiskLevel(assessment),
      assessed_by: user.id,
      assessed_at: new Date().toISOString(),
      notes: assessment.notes || null
    };

    const [inserted] = await db('breach_risk_assessments').insert(riskRecord).returning('*');

    // Update breach status to investigating if still in detected state
    if (breach.status === 'detected') {
      await db('breach_incidents').where({ id: breachId }).update({ status: 'investigating', updated_at: new Date().toISOString() });
    }

    logger.info({
      type: 'BREACH_RISK_ASSESSED',
      breachId,
      riskLevel: inserted.overall_risk_level,
      assessedBy: user.id
    });

    return inserted;
  }

  /**
   * Send notification for a breach incident.
   * Tracks all notifications per HIPAA requirements.
   */
  static async sendNotification(breachId, notificationData, user) {
    const breach = await db('breach_incidents').where({ id: breachId, provider_id: user.provider_id }).first();
    if (!breach) return null;

    const notification = {
      breach_id: breachId,
      notification_type: notificationData.notification_type,
      recipient_type: notificationData.recipient_type,
      recipient_identifier: notificationData.recipient_identifier,
      subject: notificationData.subject,
      message_body: notificationData.message_body,
      delivery_method: notificationData.delivery_method || 'email',
      status: 'pending',
      scheduled_date: notificationData.scheduled_date || new Date().toISOString(),
      sent_by: user.id,
      created_at: new Date().toISOString()
    };

    const [inserted] = await db('breach_notifications').insert(notification).returning('*');

    // Update breach status to notifying
    if (breach.status === 'confirmed' || breach.status === 'investigating') {
      await db('breach_incidents').where({ id: breachId }).update({ status: 'notifying', updated_at: new Date().toISOString() });
    }

    logger.info({
      type: 'BREACH_NOTIFICATION_SENT',
      breachId,
      notificationType: notification.notification_type,
      recipientType: notification.recipient_type,
      sentBy: user.id
    });

    return inserted;
  }

  /**
   * Get all notifications for a breach.
   */
  static async getNotifications(breachId, user) {
    const breach = await db('breach_incidents').where({ id: breachId, provider_id: user.provider_id }).first();
    if (!breach) return null;
    return db('breach_notifications').where({ breach_id: breachId }).orderBy('created_at', 'desc');
  }

  /**
   * Get risk assessment for a breach.
   */
  static async getRiskAssessment(breachId, user) {
    const breach = await db('breach_incidents').where({ id: breachId, provider_id: user.provider_id }).first();
    if (!breach) return null;
    return db('breach_risk_assessments').where({ breach_id: breachId }).orderBy('assessed_at', 'desc').first();
  }

  /**
   * Get breaches approaching or past the 60-day notification deadline.
   */
  static async getOverdueBreaches(user) {
    const now = new Date().toISOString();
    return db('breach_incidents')
      .where({ provider_id: user.provider_id })
      .whereNotIn('status', ['reported', 'closed'])
      .where('notification_deadline', '<=', now)
      .orderBy('notification_deadline', 'asc');
  }

  /**
   * Get breaches approaching deadline (within N days).
   */
  static async getApproachingDeadlineBreaches(user, withinDays = 14) {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + withinDays);

    return db('breach_incidents')
      .where({ provider_id: user.provider_id })
      .whereNotIn('status', ['reported', 'closed'])
      .where('notification_deadline', '>', now.toISOString())
      .where('notification_deadline', '<=', futureDate.toISOString())
      .orderBy('notification_deadline', 'asc');
  }

  /**
   * Mark a breach as reported to HHS.
   */
  static async markAsReported(breachId, reportDetails, user) {
    const breach = await db('breach_incidents').where({ id: breachId, provider_id: user.provider_id }).first();
    if (!breach) return null;

    const [updated] = await db('breach_incidents').where({ id: breachId }).update({
      status: 'reported',
      hhs_report_date: reportDetails.report_date || new Date().toISOString(),
      hhs_report_reference: reportDetails.reference_number || null,
      updated_at: new Date().toISOString()
    }).returning('*');

    logger.info({
      type: 'BREACH_REPORTED_TO_HHS',
      breachId,
      reportDate: updated.hhs_report_date,
      reference: updated.hhs_report_reference,
      reportedBy: user.id
    });

    return updated;
  }

  /**
   * Get annual breach summary for HHS reporting.
   * HIPAA requires annual report for breaches affecting < 500 individuals.
   */
  static async getAnnualSummary(year, user) {
    const startDate = `${year}-01-01T00:00:00.000Z`;
    const endDate = `${year}-12-31T23:59:59.999Z`;

    const breaches = await db('breach_incidents')
      .where({ provider_id: user.provider_id })
      .whereBetween('discovery_date', [startDate, endDate])
      .orderBy('discovery_date', 'asc');

    const totalAffected = breaches.reduce((sum, b) => sum + (b.individuals_affected_count || 0), 0);
    const largeBreaches = breaches.filter(b => b.individuals_affected_count >= LARGE_BREACH_THRESHOLD);
    const smallBreaches = breaches.filter(b => b.individuals_affected_count < LARGE_BREACH_THRESHOLD);

    return {
      year,
      total_breaches: breaches.length,
      total_individuals_affected: totalAffected,
      large_breaches: largeBreaches.length,
      small_breaches: smallBreaches.length,
      by_severity: {
        critical: breaches.filter(b => b.severity === 'critical').length,
        high: breaches.filter(b => b.severity === 'high').length,
        medium: breaches.filter(b => b.severity === 'medium').length,
        low: breaches.filter(b => b.severity === 'low').length
      },
      by_status: {
        detected: breaches.filter(b => b.status === 'detected').length,
        investigating: breaches.filter(b => b.status === 'investigating').length,
        confirmed: breaches.filter(b => b.status === 'confirmed').length,
        notifying: breaches.filter(b => b.status === 'notifying').length,
        reported: breaches.filter(b => b.status === 'reported').length,
        closed: breaches.filter(b => b.status === 'closed').length
      },
      breaches: breaches.map(b => ({
        id: b.id,
        title: b.title,
        severity: b.severity,
        status: b.status,
        individuals_affected_count: b.individuals_affected_count,
        discovery_date: b.discovery_date,
        notification_deadline: b.notification_deadline
      }))
    };
  }

  /**
   * Auto-schedule required notifications for large breaches (>= 500 individuals).
   * HIPAA requires: individual notice, HHS notice, and prominent media notice.
   */
  static async _scheduleLargeBreachNotifications(breach) {
    const notifications = [
      {
        breach_id: breach.id,
        notification_type: 'hhs',
        recipient_type: 'hhs',
        recipient_identifier: 'HHS Office for Civil Rights',
        subject: `Breach Notification - ${breach.title}`,
        message_body: `Large breach affecting ${breach.individuals_affected_count} individuals requires immediate HHS notification.`,
        delivery_method: 'hhs_portal',
        status: 'pending',
        scheduled_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      {
        breach_id: breach.id,
        notification_type: 'media',
        recipient_type: 'media',
        recipient_identifier: 'Prominent media outlets in affected jurisdiction',
        subject: `Healthcare Data Breach Notice - ${breach.title}`,
        message_body: `A breach affecting ${breach.individuals_affected_count} individuals requires prominent media notification per HIPAA.`,
        delivery_method: 'press_release',
        status: 'pending',
        scheduled_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    ];

    await db('breach_notifications').insert(notifications);

    logger.info({
      type: 'LARGE_BREACH_NOTIFICATIONS_SCHEDULED',
      breachId: breach.id,
      affectedCount: breach.individuals_affected_count,
      notificationTypes: ['hhs', 'media']
    });
  }

  /**
   * Calculate risk level based on four-factor assessment.
   */
  static _calculateRiskLevel(assessment) {
    let score = 0;

    // Factor 1: Nature and extent of PHI
    const phiScores = { minimal: 1, moderate: 2, extensive: 3, comprehensive: 4 };
    score += phiScores[assessment.phi_nature_extent] || 2;

    // Factor 2: Unauthorized recipient
    const recipientScores = { known_internal: 1, known_external: 2, unknown: 3, malicious_actor: 4 };
    score += recipientScores[assessment.unauthorized_recipient] || 2;

    // Factor 3: PHI acquired or viewed
    const acquiredScores = { not_accessed: 0, viewed_only: 1, acquired: 3, exfiltrated: 4 };
    score += acquiredScores[assessment.phi_acquired_or_viewed] ?? 2;

    // Factor 4: Mitigation extent
    const mitigationScores = { fully_mitigated: 0, substantially_mitigated: 1, partially_mitigated: 2, not_mitigated: 4 };
    score += mitigationScores[assessment.mitigation_extent] ?? 2;

    if (score <= 4) return 'low';
    if (score <= 8) return 'medium';
    if (score <= 12) return 'high';
    return 'critical';
  }
}

module.exports = BreachNotificationService;
module.exports.BREACH_STATUSES = BREACH_STATUSES;
module.exports.BREACH_SEVERITY = BREACH_SEVERITY;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_STATUSES = NOTIFICATION_STATUSES;
module.exports.HIPAA_NOTIFICATION_DEADLINE_DAYS = HIPAA_NOTIFICATION_DEADLINE_DAYS;
module.exports.LARGE_BREACH_THRESHOLD = LARGE_BREACH_THRESHOLD;
