const db = require('../models/db');

class ProviderPatientService {
  /**
   * Check if a provider is assigned to a specific patient.
   * Returns true if assignment exists and is active.
   */
  static async isAssigned(providerId, patientId) {
    const assignment = await db('provider_patient_assignments')
      .where({ provider_id: providerId, patient_id: patientId, status: 'active' })
      .first();
    return !!assignment;
  }

  /**
   * Verify provider has access to a patient. Throws 403 if not assigned.
   * Admin users bypass assignment checks.
   */
  static async verifyAccess(user, patientId) {
    if (user.role === 'admin') {
      return true;
    }
    const assigned = await this.isAssigned(user.provider_id, patientId);
    if (!assigned) {
      const error = new Error('Access denied: provider not assigned to this patient');
      error.status = 403;
      throw error;
    }
    return true;
  }

  /**
   * Assign a provider to a patient.
   * Only admins can create assignments.
   */
  static async assign(data, user) {
    if (user.role !== 'admin') {
      const error = new Error('Only administrators can manage provider-patient assignments');
      error.status = 403;
      throw error;
    }

    const existing = await db('provider_patient_assignments')
      .where({ provider_id: data.provider_id, patient_id: data.patient_id, status: 'active' })
      .first();

    if (existing) {
      return existing;
    }

    const [assignment] = await db('provider_patient_assignments')
      .insert({
        provider_id: data.provider_id,
        patient_id: data.patient_id,
        assigned_by: user.id,
        assigned_at: new Date(),
        status: 'active'
      })
      .returning('*');
    return assignment;
  }

  /**
   * Remove a provider-patient assignment (soft delete).
   * Only admins can revoke assignments.
   */
  static async revoke(data, user) {
    if (user.role !== 'admin') {
      const error = new Error('Only administrators can manage provider-patient assignments');
      error.status = 403;
      throw error;
    }

    const [updated] = await db('provider_patient_assignments')
      .where({ provider_id: data.provider_id, patient_id: data.patient_id, status: 'active' })
      .update({ status: 'revoked', revoked_by: user.id, revoked_at: new Date() })
      .returning('*');

    if (!updated) {
      const error = new Error('Assignment not found');
      error.status = 404;
      throw error;
    }
    return updated;
  }

  /**
   * List all active assignments for a provider.
   */
  static async listByProvider(providerId) {
    return db('provider_patient_assignments')
      .where({ provider_id: providerId, status: 'active' })
      .orderBy('assigned_at', 'desc');
  }

  /**
   * List all active assignments for a patient.
   */
  static async listByPatient(patientId) {
    return db('provider_patient_assignments')
      .where({ patient_id: patientId, status: 'active' })
      .orderBy('assigned_at', 'desc');
  }
}

module.exports = ProviderPatientService;
