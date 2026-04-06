const StorageService = require('../src/services/storageService');

jest.mock('@aws-sdk/client-s3', () => {
  const sendMock = jest.fn().mockResolvedValue({ VersionId: 'v1' });
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'PutObject' })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'GetObject' })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObject' })),
    __sendMock: sendMock,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { __sendMock: sendMock } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMock.mockResolvedValue({ VersionId: 'v1' });
  });

  describe('upload', () => {
    it('should upload file to S3 with correct key structure', async () => {
      const fileBuffer = Buffer.from('test image data');
      const metadata = {
        contentType: 'image/jpeg',
        patientId: 'patient-123',
        recordId: 'record-456',
        originalName: 'xray.jpg',
      };

      const result = await StorageService.upload(fileBuffer, metadata);

      expect(result.bucket).toBe('medsecure-medical-images');
      expect(result.key).toMatch(/^patients\/patient-123\/records\/record-456\/\d+-[a-f0-9]+\.jpg$/);
      expect(result.versionId).toBe('v1');
    });

    it('should use server-side encryption (KMS)', async () => {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const fileBuffer = Buffer.from('encrypted data');

      await StorageService.upload(fileBuffer, {
        contentType: 'image/png',
        patientId: 'p1',
        recordId: 'r1',
        originalName: 'scan.png',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ServerSideEncryption: 'aws:kms',
          ContentType: 'image/png',
        })
      );
    });

    it('should include patient and record metadata in S3 object', async () => {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const fileBuffer = Buffer.from('data');

      await StorageService.upload(fileBuffer, {
        contentType: 'image/jpeg',
        patientId: 'p-abc',
        recordId: 'r-def',
        originalName: 'image.jpg',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: expect.objectContaining({
            'patient-id': 'p-abc',
            'record-id': 'r-def',
            'original-name': 'image.jpg',
          }),
        })
      );
    });

    it('should handle files without extensions', async () => {
      const fileBuffer = Buffer.from('dicom data');

      const result = await StorageService.upload(fileBuffer, {
        contentType: 'application/dicom',
        patientId: 'p1',
        recordId: 'r1',
        originalName: '',
      });

      expect(result.key).toMatch(/^patients\/p1\/records\/r1\/\d+-[a-f0-9]+$/);
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate a presigned URL for the given key', async () => {
      const url = await StorageService.getPresignedUrl('patients/p1/records/r1/file.jpg');

      expect(url).toBe('https://s3.example.com/presigned-url');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ _type: 'GetObject' }),
        expect.objectContaining({ expiresIn: 3600 })
      );
    });
  });

  describe('delete', () => {
    it('should delete the object from S3', async () => {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

      await StorageService.delete('patients/p1/records/r1/file.jpg');

      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'medsecure-medical-images',
          Key: 'patients/p1/records/r1/file.jpg',
        })
      );
      expect(sendMock).toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('should download the object from S3 and return body and contentType', async () => {
      sendMock.mockResolvedValue({
        Body: 'mock-stream',
        ContentType: 'image/jpeg',
      });

      const result = await StorageService.download('patients/p1/records/r1/file.jpg');

      expect(result.body).toBe('mock-stream');
      expect(result.contentType).toBe('image/jpeg');
    });
  });
});
