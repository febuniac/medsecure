const db = require('../models/db');

class ProviderPatientService {
  /**
   * Check if a provider is assigned to a patient.
   * Admin users bypass this check.
   */
  static async isAssigned(providerId, patientId) {
    const assignment = await db('provider_patient_assignments')
      .where({ provider_id: providerId, patient_id: patientId, status: 'active' })
      .first();
    return !!assignment;
  }

  /**
   * Verify that the requesting user has access to a patient's data.
   * Admins have access to all patients.
   * Providers only have access to their assigned patients.
   * Returns true if access is granted, false otherwise.
   */
  static async verifyAccess(user, patientId) {
    if (user.role === 'admin') {
      return true;
    }
    return this.isAssigned(user.provider_id, patientId);
  }

  /**
   * Assign a provider to a patient.
   * Only admins or the provider's own organization admin can do this.
   */
  static async assign(data, user) {
    const existing = await db('provider_patient_assignments')
      .where({
        provider_id: data.provider_id,
        patient_id: data.patient_id,
        status: 'active',
      })
      .first();

    if (existing) {
      return existing;
    }

    const [assignment] = await db('provider_patient_assignments')
      .insert({
        provider_id: data.provider_id,
        patient_id: data.patient_id,
        assigned_by: user.id,
        status: 'active',
        assigned_at: new Date().toISOString(),
      })
      .returning('*');
    return assignment;
  }

  /**
   * Remove a provider-patient assignment (soft delete by setting status to 'revoked').
   */
  static async revoke(providerId, patientId, user) {
    const assignment = await db('provider_patient_assignments')
      .where({ provider_id: providerId, patient_id: patientId, status: 'active' })
      .first();

    if (!assignment) {
      const error = new Error('Assignment not found');
      error.status = 404;
      throw error;
    }

    const [updated] = await db('provider_patient_assignments')
      .where({ id: assignment.id })
      .update({
        status: 'revoked',
        revoked_by: user.id,
        revoked_at: new Date().toISOString(),
      })
      .returning('*');
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
