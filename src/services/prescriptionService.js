const db = require('../models/db');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');

class PrescriptionService {
  /**
   * Retrieve all prescriptions for a patient.
   */
  static async getByPatient(patientId, user) {
    await ProviderPatientService.verifyAccess(user, patientId);
    return db('prescriptions')
      .where({ patient_id: patientId })
      .orderBy('created_at', 'desc');
  }

  /**
   * Check for drug interactions between a new drug and the patient's existing
   * active prescriptions.  Queries the `drug_interactions` table for any known
   * interaction pair that involves the new drug and any currently-prescribed drug.
   *
   * @param {string} patientId
   * @param {string} drugName - name of the drug being prescribed
   * @returns {Promise<Array>} list of interaction objects (empty if none)
   */
  static async checkInteractions(patientId, drugName) {
    const activePrescriptions = await db('prescriptions')
      .where({ patient_id: patientId, status: 'active' });

    if (activePrescriptions.length === 0) {
      return [];
    }

    const activeNames = activePrescriptions.map(rx => rx.drug_name);

    const interactions = await db('drug_interactions')
      .where(function () {
        this.where('drug_a', drugName).whereIn('drug_b', activeNames);
      })
      .orWhere(function () {
        this.where('drug_b', drugName).whereIn('drug_a', activeNames);
      });

    return interactions;
  }

  /**
   * Create a new prescription after verifying provider access and checking
   * for drug interactions.
   */
  static async create(data, user) {
    await ProviderPatientService.verifyAccess(user, data.patient_id);

    if (!data.drug_name) {
      throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELDS, 'Drug name is required');
    }

    // Check for drug interactions before creating the prescription
    const interactions = await PrescriptionService.checkInteractions(
      data.patient_id,
      data.drug_name
    );

    if (interactions.length > 0) {
      const conflicting = interactions.map(i =>
        i.drug_a === data.drug_name ? i.drug_b : i.drug_a
      );
      throw new AppError(
        ErrorCodes.DRUG_INTERACTION_FOUND,
        `Drug interaction detected: ${data.drug_name} interacts with ${conflicting.join(', ')}`,
        { details: interactions }
      );
    }

    data.prescribed_by = user.id;
    data.status = data.status || 'active';
    const [prescription] = await db('prescriptions').insert(data).returning('*');
    return prescription;
  }

  /**
   * Refill an existing prescription (re-checks interactions before refilling).
   */
  static async refill(id, user) {
    const prescription = await db('prescriptions').where({ id }).first();
    if (!prescription) {
      throw new AppError(ErrorCodes.PRESCRIPTION_NOT_FOUND, 'Prescription not found');
    }

    await ProviderPatientService.verifyAccess(user, prescription.patient_id);

    // Re-check interactions in case new prescriptions were added since last fill
    const interactions = await PrescriptionService.checkInteractions(
      prescription.patient_id,
      prescription.drug_name
    );

    if (interactions.length > 0) {
      const conflicting = interactions.map(i =>
        i.drug_a === prescription.drug_name ? i.drug_b : i.drug_a
      );
      throw new AppError(
        ErrorCodes.DRUG_INTERACTION_FOUND,
        `Drug interaction detected on refill: ${prescription.drug_name} interacts with ${conflicting.join(', ')}`,
        { details: interactions }
      );
    }

    const [updated] = await db('prescriptions')
      .where({ id })
      .update({
        refill_count: db.raw('refill_count + 1'),
        last_refill_at: new Date(),
        last_refill_by: user.id,
      })
      .returning('*');
    return updated;
  }
}

module.exports = PrescriptionService;
