const ImageAttachmentService = require('../src/services/imageAttachmentService');
const StorageService = require('../src/services/storageService');
const db = require('../src/models/db');

jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  mKnex.fn = { now: jest.fn().mockReturnValue('2026-01-01T00:00:00Z') };
  return mKnex;
});

jest.mock('../src/services/storageService', () => ({
  upload: jest.fn(),
  getPresignedUrl: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe('ImageAttachmentService', () => {
  const mockUser = { id: 'user-1', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('should upload image to S3 and store reference in database', async () => {
      const mockRecord = { id: 'record-1', patient_id: 'patient-1' };
      const mockAttachment = {
        id: 'att-1',
        record_id: 'record-1',
        patient_id: 'patient-1',
        storage_key: 'patients/patient-1/records/record-1/123-abc.jpg',
        storage_bucket: 'medsecure-medical-images',
        storage_url: 's3://medsecure-medical-images/patients/patient-1/records/record-1/123-abc.jpg',
        content_type: 'image/jpeg',
        file_size: 1024,
        original_name: 'xray.jpg',
      };

      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };

      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockAttachment]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return insertQuery;
        return {};
      });

      StorageService.upload.mockResolvedValue({
        key: 'patients/patient-1/records/record-1/123-abc.jpg',
        bucket: 'medsecure-medical-images',
        versionId: 'v1',
      });

      const result = await ImageAttachmentService.upload({
        recordId: 'record-1',
        patientId: 'patient-1',
        fileBuffer: Buffer.alloc(1024),
        contentType: 'image/jpeg',
        originalName: 'xray.jpg',
        userId: 'user-1',
      });

      expect(result.id).toBe('att-1');
      expect(result.storage_url).toContain('s3://');
      expect(StorageService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          contentType: 'image/jpeg',
          patientId: 'patient-1',
          recordId: 'record-1',
        })
      );
      expect(insertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          storage_key: 'patients/patient-1/records/record-1/123-abc.jpg',
          storage_bucket: 'medsecure-medical-images',
          content_type: 'image/jpeg',
        })
      );
    });

    it('should reject unsupported content types', async () => {
      await expect(
        ImageAttachmentService.upload({
          recordId: 'record-1',
          patientId: 'patient-1',
          fileBuffer: Buffer.alloc(100),
          contentType: 'application/zip',
          originalName: 'file.zip',
          userId: 'user-1',
        })
      ).rejects.toThrow('Unsupported content type');
    });

    it('should reject unsupported content types with status 400', async () => {
      try {
        await ImageAttachmentService.upload({
          recordId: 'r1',
          patientId: 'p1',
          fileBuffer: Buffer.alloc(100),
          contentType: 'text/plain',
          originalName: 'file.txt',
          userId: 'user-1',
        });
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });

    it('should reject files exceeding maximum size', async () => {
      const oversizedBuffer = Buffer.alloc(52428801); // 50MB + 1 byte

      try {
        await ImageAttachmentService.upload({
          recordId: 'r1',
          patientId: 'p1',
          fileBuffer: oversizedBuffer,
          contentType: 'image/jpeg',
          originalName: 'huge.jpg',
          userId: 'user-1',
        });
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toContain('exceeds maximum allowed size');
      }
    });

    it('should return 404 when medical record does not exist', async () => {
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        return {};
      });

      try {
        await ImageAttachmentService.upload({
          recordId: 'nonexistent',
          patientId: 'p1',
          fileBuffer: Buffer.alloc(100),
          contentType: 'image/jpeg',
          originalName: 'test.jpg',
          userId: 'user-1',
        });
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toContain('not found');
      }
    });

    it('should accept DICOM images', async () => {
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'r1' }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'att-1', content_type: 'application/dicom' }]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return insertQuery;
        return {};
      });

      StorageService.upload.mockResolvedValue({
        key: 'k',
        bucket: 'b',
        versionId: 'v1',
      });

      const result = await ImageAttachmentService.upload({
        recordId: 'r1',
        patientId: 'p1',
        fileBuffer: Buffer.alloc(100),
        contentType: 'application/dicom',
        originalName: 'scan.dcm',
        userId: 'user-1',
      });

      expect(result.content_type).toBe('application/dicom');
    });
  });

  describe('getDownloadUrl', () => {
    it('should return a presigned URL for the attachment', async () => {
      const mockAttachment = {
        id: 'att-1',
        storage_key: 'key/path',
        record_id: 'r1',
        patient_id: 'p1',
        content_type: 'image/jpeg',
        original_name: 'xray.jpg',
      };

      const query = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockAttachment),
      };

      db.mockImplementation(() => query);
      StorageService.getPresignedUrl.mockResolvedValue('https://presigned.url/path');

      const result = await ImageAttachmentService.getDownloadUrl('att-1', mockUser);

      expect(result.url).toBe('https://presigned.url/path');
      expect(result.contentType).toBe('image/jpeg');
      expect(result.originalName).toBe('xray.jpg');
    });

    it('should return 404 for non-existent attachment', async () => {
      const query = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };

      db.mockImplementation(() => query);

      try {
        await ImageAttachmentService.getDownloadUrl('nonexistent', mockUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });

  describe('listByRecord', () => {
    it('should list attachments for a record ordered by created_at desc', async () => {
      const mockAttachments = [
        { id: 'att-2', created_at: '2026-01-02' },
        { id: 'att-1', created_at: '2026-01-01' },
      ];

      const query = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockAttachments),
      };

      db.mockImplementation(() => query);

      const result = await ImageAttachmentService.listByRecord('record-1');

      expect(result).toHaveLength(2);
      expect(query.where).toHaveBeenCalledWith({ record_id: 'record-1' });
      expect(query.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
  });

  describe('delete', () => {
    it('should delete from S3 and database', async () => {
      const mockAttachment = {
        id: 'att-1',
        storage_key: 'key/path',
        record_id: 'r1',
        patient_id: 'p1',
      };

      const selectQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockAttachment),
      };

      const deleteQuery = {
        where: jest.fn().mockReturnThis(),
        del: jest.fn().mockResolvedValue(1),
      };

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectQuery;
        return deleteQuery;
      });

      StorageService.delete.mockResolvedValue(undefined);

      await ImageAttachmentService.delete('att-1', mockUser);

      expect(StorageService.delete).toHaveBeenCalledWith('key/path');
      expect(deleteQuery.del).toHaveBeenCalled();
    });

    it('should return 404 when attachment not found for delete', async () => {
      const query = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };

      db.mockImplementation(() => query);

      try {
        await ImageAttachmentService.delete('nonexistent', mockUser);
        fail('Expected an error to be thrown');
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });
});
