const ImageAttachmentService = require('../src/services/imageAttachmentService');
const { StorageError } = require('../src/services/storageService');
const { AppError, ErrorCodes } = require('../src/utils/errorCodes');

jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  mKnex.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    first: jest.fn(),
    del: jest.fn(),
  });
  return mKnex;
});

jest.mock('../src/services/providerPatientService');
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const db = require('../src/models/db');
const ProviderPatientService = require('../src/services/providerPatientService');

describe('ImageAttachmentService', () => {
  let service;
  let mockStorage;
  const user = { id: 'user-1', role: 'provider', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = {
      upload: jest.fn().mockResolvedValue({
        storage_key: 'medical-images/2026/04/06/rec-1/abc.jpg',
        storage_bucket: 'medsecure-medical-images',
        file_size: 1024,
        mime_type: 'image/jpeg',
        original_filename: 'xray.jpg',
      }),
      getPresignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned'),
      delete: jest.fn().mockResolvedValue(undefined),
      validateFile: jest.fn(),
    };
    service = new ImageAttachmentService(mockStorage);
  });

  describe('upload', () => {
    it('should upload an image and store metadata in db', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const mockAttachment = {
        id: 'att-1',
        record_id: 'rec-1',
        storage_key: 'medical-images/2026/04/06/rec-1/abc.jpg',
        storage_bucket: 'medsecure-medical-images',
        file_size: 1024,
        mime_type: 'image/jpeg',
        original_filename: 'xray.jpg',
        uploaded_by: 'user-1',
      };

      // Mock: db('medical_records').where({ id: recordId }).first()
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      // Mock: db('image_attachments').insert(...).returning('*')
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockAttachment]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return insertQuery;
        return {};
      });

      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      const fileBuffer = Buffer.from('fake-image-data');
      const result = await service.upload('rec-1', fileBuffer, 'image/jpeg', 'xray.jpg', user);

      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(user, 'patient-1');
      expect(mockStorage.upload).toHaveBeenCalledWith(fileBuffer, 'image/jpeg', 'rec-1', 'xray.jpg');
      expect(result).toEqual(mockAttachment);
    });

    it('should throw RECORD_NOT_FOUND when record does not exist', async () => {
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => recordQuery);

      const fileBuffer = Buffer.from('fake-image-data');

      await expect(
        service.upload('non-existent', fileBuffer, 'image/jpeg', 'xray.jpg', user)
      ).rejects.toThrow('Record not found');
    });

    it('should throw when provider is not assigned to patient', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => recordQuery);

      const accessError = new Error('Access denied');
      accessError.status = 403;
      ProviderPatientService.verifyAccess.mockRejectedValue(accessError);

      const fileBuffer = Buffer.from('fake-image-data');

      await expect(
        service.upload('rec-1', fileBuffer, 'image/jpeg', 'xray.jpg', user)
      ).rejects.toThrow('Access denied');
    });

    it('should propagate StorageError from storage service', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      db.mockImplementation(() => recordQuery);
      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      mockStorage.upload.mockRejectedValue(
        new StorageError('FILE_TOO_LARGE', 'File exceeds maximum size')
      );

      const fileBuffer = Buffer.alloc(60 * 1024 * 1024);

      await expect(
        service.upload('rec-1', fileBuffer, 'image/jpeg', 'big.jpg', user)
      ).rejects.toThrow(StorageError);
    });
  });

  describe('getByRecord', () => {
    it('should return attachments for a record', async () => {
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };
      const mockAttachments = [
        { id: 'att-1', record_id: 'rec-1', storage_key: 'key1' },
        { id: 'att-2', record_id: 'rec-1', storage_key: 'key2' },
      ];

      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockAttachments),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      const result = await service.getByRecord('rec-1', user);

      expect(result).toEqual(mockAttachments);
      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(user, 'patient-1');
    });

    it('should throw RECORD_NOT_FOUND when record does not exist', async () => {
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => recordQuery);

      await expect(
        service.getByRecord('non-existent', user)
      ).rejects.toThrow('Record not found');
    });
  });

  describe('getPresignedUrl', () => {
    it('should return a presigned URL for a valid attachment', async () => {
      const mockAttachment = { id: 'att-1', record_id: 'rec-1', storage_key: 'key1' };
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };

      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockAttachment),
      };
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };

      let callCount = 0;
      db.mockImplementation((table) => {
        if (table === 'image_attachments') return attachmentQuery;
        if (table === 'medical_records') return recordQuery;
        return {};
      });

      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      const result = await service.getPresignedUrl('att-1', user);

      expect(result).toEqual({ url: 'https://s3.amazonaws.com/presigned', expires_in: 3600 });
      expect(mockStorage.getPresignedUrl).toHaveBeenCalledWith('key1');
    });

    it('should throw when attachment does not exist', async () => {
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => attachmentQuery);

      await expect(
        service.getPresignedUrl('non-existent', user)
      ).rejects.toThrow('Attachment not found');
    });
  });

  describe('delete', () => {
    it('should delete an attachment from S3 and the database', async () => {
      const mockAttachment = { id: 'att-1', record_id: 'rec-1', storage_key: 'key1' };
      const mockRecord = { id: 'rec-1', patient_id: 'patient-1' };

      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockAttachment),
        del: jest.fn().mockResolvedValue(1),
      };
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };

      db.mockImplementation((table) => {
        if (table === 'image_attachments') return attachmentQuery;
        if (table === 'medical_records') return recordQuery;
        return {};
      });

      ProviderPatientService.verifyAccess.mockResolvedValue(true);

      await service.delete('att-1', user);

      expect(mockStorage.delete).toHaveBeenCalledWith('key1');
      expect(ProviderPatientService.verifyAccess).toHaveBeenCalledWith(user, 'patient-1');
    });

    it('should throw when attachment does not exist', async () => {
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };
      db.mockImplementation(() => attachmentQuery);

      await expect(
        service.delete('non-existent', user)
      ).rejects.toThrow('Attachment not found');
    });
  });
});
