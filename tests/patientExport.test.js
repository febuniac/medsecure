const PatientExportService = require('../src/services/patientExportService');

// Mock dependencies
jest.mock('../src/models/db', () => {
  const mockKnex = jest.fn(() => mockKnex);
  mockKnex.where = jest.fn(() => mockKnex);
  mockKnex.first = jest.fn();
  mockKnex.orderBy = jest.fn();
  mockKnex.select = jest.fn();
  return mockKnex;
});

jest.mock('../src/utils/encryption', () => ({
  encrypt: jest.fn((text) => `encrypted:${text}`),
  decrypt: jest.fn((data) => '123-45-6789'),
}));

jest.mock('../src/services/providerPatientService', () => ({
  verifyAccess: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const db = require('../src/models/db');
const { decrypt } = require('../src/utils/encryption');
const ProviderPatientService = require('../src/services/providerPatientService');

describe('PatientExportService', () => {
  const mockUser = { id: 'user-1', role: 'provider', provider_id: 'prov-1' };
  const mockPatient = {
    id: 'patient-1',
    first_name: 'John',
    last_name: 'Doe',
    dob: '1990-01-15',
    gender: 'male',
    email: 'john.doe@example.com',
    ssn_encrypted: 'enc:data:tag',
    created_at: '2025-01-01T00:00:00.000Z',
  };
  const mockRecords = [
    {
      id: 'record-1',
      patient_id: 'patient-1',
      diagnosis: 'Hypertension',
      date: '2025-06-01',
      status: 'active',
      notes: 'Blood pressure elevated',
    },
    {
      id: 'record-2',
      patient_id: 'patient-1',
      description: 'Annual checkup',
      date: '2025-03-15',
      status: 'resolved',
      notes: null,
    },
  ];
  const mockAppointments = [
    {
      id: 'appt-1',
      patient_id: 'patient-1',
      date: '2025-07-01T10:00:00.000Z',
      status: 'booked',
      description: 'Follow-up visit',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up the knex chain mock for each call
    db.mockImplementation((table) => {
      const chain = {
        where: jest.fn(() => chain),
        first: jest.fn(),
        orderBy: jest.fn(),
      };

      if (table === 'patients') {
        chain.first.mockResolvedValue(mockPatient);
      } else if (table === 'medical_records') {
        chain.orderBy.mockResolvedValue(mockRecords);
      } else if (table === 'appointments') {
        chain.orderBy.mockResolvedValue(mockAppointments);
      }

      return chain;
    });
  });

  describe('exportPatientData', () => {
    test('returns a valid FHIR Bundle with patient data', async () => {
      const bundle = await PatientExportService.exportPatientData('patient-1', mockUser);

      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('collection');
      expect(bundle.timestamp).toBeDefined();
      expect(bundle.entry).toBeInstanceOf(Array);
      // 1 patient + 2 records + 1 appointment = 4
      expect(bundle.total).toBe(4);
      expect(bundle.entry.length).toBe(4);
    });

    test('verifies provider access before exporting', async () => {
      await PatientExportService.exportPatientData('patient-1', mockUser);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(mockUser, 'patient-1');
    });

    test('throws PATIENT_NOT_FOUND when patient does not exist', async () => {
      db.mockImplementation((table) => {
        const chain = {
          where: jest.fn(() => chain),
          first: jest.fn().mockResolvedValue(null),
          orderBy: jest.fn().mockResolvedValue([]),
        };
        return chain;
      });

      await expect(
        PatientExportService.exportPatientData('nonexistent', mockUser)
      ).rejects.toThrow('Patient not found');
    });

    test('throws when provider access is denied', async () => {
      ProviderPatientService.verifyAccess.mockRejectedValueOnce(
        new Error('Access denied: provider not assigned to this patient')
      );

      await expect(
        PatientExportService.exportPatientData('patient-1', mockUser)
      ).rejects.toThrow('Access denied');
    });

    test('logs HIPAA audit entry on export', async () => {
      const { logger } = require('../src/utils/logger');
      await PatientExportService.exportPatientData('patient-1', mockUser);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'HIPAA_AUDIT',
          action: 'PATIENT_DATA_EXPORT',
          patientId: 'patient-1',
          userId: 'user-1',
        })
      );
    });

    test('handles patient with no records or appointments', async () => {
      db.mockImplementation((table) => {
        const chain = {
          where: jest.fn(() => chain),
          first: jest.fn(),
          orderBy: jest.fn(),
        };

        if (table === 'patients') {
          chain.first.mockResolvedValue(mockPatient);
        } else {
          chain.orderBy.mockResolvedValue([]);
        }
        return chain;
      });

      const bundle = await PatientExportService.exportPatientData('patient-1', mockUser);

      expect(bundle.total).toBe(1);
      expect(bundle.entry[0].resource.resourceType).toBe('Patient');
    });
  });

  describe('buildFhirBundle', () => {
    test('creates a collection bundle with correct structure', () => {
      const bundle = PatientExportService.buildFhirBundle(mockPatient, mockRecords, mockAppointments);

      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('collection');
      expect(bundle.total).toBe(4);
      expect(bundle.timestamp).toBeDefined();
    });

    test('includes all resource types in entries', () => {
      const bundle = PatientExportService.buildFhirBundle(mockPatient, mockRecords, mockAppointments);

      const resourceTypes = bundle.entry.map((e) => e.resource.resourceType);
      expect(resourceTypes).toContain('Patient');
      expect(resourceTypes).toContain('Condition');
      expect(resourceTypes).toContain('Appointment');
    });

    test('entries have fullUrl with urn:uuid format', () => {
      const bundle = PatientExportService.buildFhirBundle(mockPatient, mockRecords, mockAppointments);

      for (const entry of bundle.entry) {
        expect(entry.fullUrl).toMatch(/^urn:uuid:/);
      }
    });
  });

  describe('toFhirPatient', () => {
    test('maps patient demographics correctly', () => {
      const resource = PatientExportService.toFhirPatient(mockPatient);

      expect(resource.resourceType).toBe('Patient');
      expect(resource.id).toBe('patient-1');
      expect(resource.name[0].family).toBe('Doe');
      expect(resource.name[0].given).toEqual(['John']);
      expect(resource.birthDate).toBe('1990-01-15');
      expect(resource.gender).toBe('male');
    });

    test('includes email as telecom', () => {
      const resource = PatientExportService.toFhirPatient(mockPatient);

      expect(resource.telecom).toEqual([
        { system: 'email', value: 'john.doe@example.com' },
      ]);
    });

    test('includes SSN as identifier when decryption succeeds', () => {
      const resource = PatientExportService.toFhirPatient(mockPatient);

      expect(resource.identifier).toEqual([
        { system: 'http://hl7.org/fhir/sid/us-ssn', value: '123-45-6789' },
      ]);
    });

    test('omits identifier when SSN decryption fails', () => {
      decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const resource = PatientExportService.toFhirPatient(mockPatient);

      expect(resource.identifier).toBeUndefined();
    });

    test('omits gender when not present', () => {
      const patientNoGender = { ...mockPatient, gender: undefined };
      const resource = PatientExportService.toFhirPatient(patientNoGender);

      expect(resource.gender).toBeUndefined();
    });

    test('omits telecom when email not present', () => {
      const patientNoEmail = { ...mockPatient, email: undefined };
      const resource = PatientExportService.toFhirPatient(patientNoEmail);

      expect(resource.telecom).toBeUndefined();
    });
  });

  describe('toFhirCondition', () => {
    test('maps medical record to FHIR Condition', () => {
      const resource = PatientExportService.toFhirCondition(mockRecords[0], 'patient-1');

      expect(resource.resourceType).toBe('Condition');
      expect(resource.id).toBe('record-1');
      expect(resource.subject.reference).toBe('Patient/patient-1');
      expect(resource.code.text).toBe('Hypertension');
      expect(resource.recordedDate).toBe('2025-06-01');
      expect(resource.clinicalStatus.coding[0].code).toBe('active');
      expect(resource.note[0].text).toBe('Blood pressure elevated');
    });

    test('uses description when diagnosis is absent', () => {
      const resource = PatientExportService.toFhirCondition(mockRecords[1], 'patient-1');

      expect(resource.code.text).toBe('Annual checkup');
    });

    test('omits note when notes are null', () => {
      const resource = PatientExportService.toFhirCondition(mockRecords[1], 'patient-1');

      expect(resource.note).toBeUndefined();
    });
  });

  describe('toFhirAppointment', () => {
    test('maps appointment to FHIR Appointment', () => {
      const resource = PatientExportService.toFhirAppointment(mockAppointments[0], 'patient-1');

      expect(resource.resourceType).toBe('Appointment');
      expect(resource.id).toBe('appt-1');
      expect(resource.status).toBe('booked');
      expect(resource.participant[0].actor.reference).toBe('Patient/patient-1');
      expect(resource.start).toBeDefined();
      expect(resource.description).toBe('Follow-up visit');
    });

    test('defaults status to booked when not provided', () => {
      const appt = { ...mockAppointments[0], status: undefined };
      const resource = PatientExportService.toFhirAppointment(appt, 'patient-1');

      expect(resource.status).toBe('booked');
    });
  });
});
