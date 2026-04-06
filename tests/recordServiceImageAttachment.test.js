const RecordService = require('../src/services/recordService');
const ProviderPatientService = require('../src/services/providerPatientService');
const { ImageStorageService } = require('../src/services/imageStorageService');
const db = require('../src/models/db');

jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
    update: jest.fn().mockReturnThis(),
  });
  return mKnex;
});

jest.mock('../src/services/providerPatientService');
jest.mock('../src/services/imageStorageService');

describe('RecordService — image attachment', () => {
  const assignedUser = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should strip image_data from the record before inserting', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'rec-1', patient_id: 'patient-1' }]),
      };
      db.mockImplementation(() => mockQuery);

      const data = { patient_id: 'patient-1', type: 'imaging', image_data: Buffer.from('blob-data') };
      await RecordService.create(data, assignedUser);

      expect(data.image_data).toBeUndefined();
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({ image_data: expect.anything() })
      );
    });

    it('should work normally when no image_data is present', async () => {
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'rec-1', patient_id: 'patient-1' }]),
      };
      db.mockImplementation(() => mockQuery);

      const data = { patient_id: 'patient-1', type: 'visit_note', content: 'Visit notes' };
      const result = await RecordService.create(data, assignedUser);

      expect(result).toEqual([{ id: 'rec-1', patient_id: 'patient-1' }]);
    });
  });

  describe('attachImage', () => {
    it('should upload image to S3 and update record with storage metadata', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const updatedRecord = {
        id: 'rec-1',
        patient_id: 'patient-1',
        image_storage_key: 'patients/patient-1/images/scan.jpg',
        image_bucket: 'medsecure-medical-images',
        image_content_type: 'image/jpeg',
        image_size_bytes: 100,
        image_url: 's3://medsecure-medical-images/patients/patient-1/images/scan.jpg',
      };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([updatedRecord]),
      };

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? mockSelectQuery : mockUpdateQuery;
      });

      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      ImageStorageService.upload.mockResolvedValue({
        storageKey: 'patients/patient-1/images/scan.jpg',
        bucket: 'medsecure-medical-images',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        url: 's3://medsecure-medical-images/patients/patient-1/images/scan.jpg',
      });

      const result = await RecordService.attachImage(
        'rec-1',
        assignedUser,
        Buffer.from('image-data'),
        'scan.jpg',
        'image/jpeg'
      );

      expect(ImageStorageService.upload).toHaveBeenCalledWith(
        'patient-1',
        expect.any(Buffer),
        'scan.jpg',
        'image/jpeg'
      );
      expect(result.image_storage_key).toBe('patients/patient-1/images/scan.jpg');
      expect(result.image_url).toContain('s3://');
    });

    it('should throw 404 when record does not exist', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => mockQuery);

      await expect(
        RecordService.attachImage('non-existent', assignedUser, Buffer.from('data'), 'scan.jpg', 'image/jpeg')
      ).rejects.toThrow('Record not found');
    });

    it('should throw 403 when provider is not assigned to the patient', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => mockQuery);

      const accessError = new Error('Access denied: provider not assigned to this patient');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      await expect(
        RecordService.attachImage('rec-1', assignedUser, Buffer.from('data'), 'scan.jpg', 'image/jpeg')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('getImageUrl', () => {
    it('should return a signed URL when image exists', async () => {
      const mockRecord = {
        id: 'rec-1',
        patient_id: 'patient-1',
        image_storage_key: 'patients/patient-1/images/scan.jpg',
        image_content_type: 'image/jpeg',
      };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => mockQuery);
      ProviderPatientService.verifyAccess.mockResolvedValue(true);
      ImageStorageService.getSignedUrl.mockResolvedValue('https://s3.example.com/signed');

      const result = await RecordService.getImageUrl('rec-1', assignedUser);

      expect(result.url).toBe('https://s3.example.com/signed');
      expect(result.contentType).toBe('image/jpeg');
      expect(ImageStorageService.getSignedUrl).toHaveBeenCalledWith('patients/patient-1/images/scan.jpg');
    });

    it('should throw 404 when record does not exist', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => mockQuery);

      await expect(
        RecordService.getImageUrl('non-existent', assignedUser)
      ).rejects.toThrow('Record not found');
    });

    it('should throw error when no image is attached', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1', image_storage_key: null };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => mockQuery);
      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      await expect(
        RecordService.getImageUrl('rec-1', assignedUser)
      ).rejects.toThrow('No image attached to this record');
    });

    it('should throw 403 when provider is not assigned', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1', image_storage_key: 'key' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => mockQuery);

      const accessError = new Error('Access denied');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      await expect(
        RecordService.getImageUrl('rec-1', assignedUser)
      ).rejects.toThrow('Access denied');
    });
  });
});
