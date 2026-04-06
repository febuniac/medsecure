const db = require('../models/db');
const { decrypt } = require('../utils/encryption');
const ProviderPatientService = require('./providerPatientService');
const { AppError, ErrorCodes } = require('../utils/errorCodes');
const { logger } = require('../utils/logger');

class PatientExportService {
  /**
   * Export patient data in FHIR R4-compatible Bundle format.
   * Includes patient demographics, medical records, and appointments.
   * Access is verified via provider-patient assignment.
   */
  static async exportPatientData(patientId, user) {
    await ProviderPatientService.verifyAccess(user, patientId);

    const patient = await db('patients').where({ id: patientId }).first();
    if (!patient) {
      throw new AppError(ErrorCodes.PATIENT_NOT_FOUND, 'Patient not found');
    }

    const records = await db('medical_records')
      .where({ patient_id: patientId })
      .orderBy('date', 'desc');

    const appointments = await db('appointments')
      .where({ patient_id: patientId })
      .orderBy('date', 'desc');

    const bundle = this.buildFhirBundle(patient, records, appointments);

    logger.info({
      type: 'HIPAA_AUDIT',
      action: 'PATIENT_DATA_EXPORT',
      patientId,
      userId: user.id,
      resourceCount: bundle.total,
      timestamp: new Date().toISOString(),
    });

    return bundle;
  }

  /**
   * Build a FHIR R4 Bundle of type "collection" containing the patient resource
   * and associated clinical data.
   */
  static buildFhirBundle(patient, records, appointments) {
    const entries = [];

    entries.push({
      fullUrl: `urn:uuid:${patient.id}`,
      resource: this.toFhirPatient(patient),
    });

    for (const record of records) {
      entries.push({
        fullUrl: `urn:uuid:${record.id}`,
        resource: this.toFhirCondition(record, patient.id),
      });
    }

    for (const appointment of appointments) {
      entries.push({
        fullUrl: `urn:uuid:${appointment.id}`,
        resource: this.toFhirAppointment(appointment, patient.id),
      });
    }

    return {
      resourceType: 'Bundle',
      type: 'collection',
      total: entries.length,
      timestamp: new Date().toISOString(),
      entry: entries,
    };
  }

  /**
   * Map internal patient record to FHIR R4 Patient resource.
   */
  static toFhirPatient(patient) {
    const resource = {
      resourceType: 'Patient',
      id: patient.id,
      name: [
        {
          use: 'official',
          family: patient.last_name,
          given: [patient.first_name],
        },
      ],
      birthDate: patient.dob
        ? new Date(patient.dob).toISOString().split('T')[0]
        : undefined,
    };

    if (patient.gender) {
      resource.gender = patient.gender;
    }

    if (patient.email) {
      resource.telecom = [
        {
          system: 'email',
          value: patient.email,
        },
      ];
    }

    if (patient.ssn_encrypted) {
      try {
        const ssn = decrypt(patient.ssn_encrypted);
        resource.identifier = [
          {
            system: 'http://hl7.org/fhir/sid/us-ssn',
            value: ssn,
          },
        ];
      } catch (_err) {
        // SSN decryption failed; omit from export
      }
    }

    return resource;
  }

  /**
   * Map internal medical record to FHIR R4 Condition resource.
   */
  static toFhirCondition(record, patientId) {
    const resource = {
      resourceType: 'Condition',
      id: record.id,
      subject: {
        reference: `Patient/${patientId}`,
      },
    };

    if (record.diagnosis || record.description) {
      resource.code = {
        text: record.diagnosis || record.description,
      };
    }

    if (record.date) {
      resource.recordedDate = new Date(record.date).toISOString().split('T')[0];
    }

    if (record.status) {
      resource.clinicalStatus = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: record.status,
          },
        ],
      };
    }

    if (record.notes) {
      resource.note = [{ text: record.notes }];
    }

    return resource;
  }

  /**
   * Map internal appointment to FHIR R4 Appointment resource.
   */
  static toFhirAppointment(appointment, patientId) {
    const resource = {
      resourceType: 'Appointment',
      id: appointment.id,
      status: appointment.status || 'booked',
      participant: [
        {
          actor: {
            reference: `Patient/${patientId}`,
          },
          status: 'accepted',
        },
      ],
    };

    if (appointment.date) {
      resource.start = new Date(appointment.date).toISOString();
    }

    if (appointment.description || appointment.reason) {
      resource.description = appointment.description || appointment.reason;
    }

    return resource;
  }
}

module.exports = PatientExportService;
