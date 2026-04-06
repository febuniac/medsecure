const {
  ImageStorageService,
  validateImage,
  generateObjectKey,
  resetS3Client,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_SIZE,
} = require('../src/services/imageStorageService');

jest.mock('@aws-sdk/client-s3', () => {
  const sendMock = jest.fn().mockResolvedValue({});
  const S3ClientMock = jest.fn().mockImplementation(() => ({ send: sendMock }));
  return {
    S3Client: S3ClientMock,
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'PutObjectCommand' })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'GetObjectCommand' })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObjectCommand' })),
    __sendMock: sendMock,
    __S3ClientMock: S3ClientMock,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/signed-url'),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const { __sendMock: sendMock } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

describe('ImageStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetS3Client();
  });

  describe('validateImage', () => {
    it('should reject empty image data', () => {
      const result = validateImage(Buffer.alloc(0), 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject null image data', () => {
      const result = validateImage(null, 'image/jpeg');
      expect(result.valid).toBe(false);
    });

    it('should reject images exceeding max size', () => {
      const oversized = Buffer.alloc(MAX_IMAGE_SIZE + 1);
      const result = validateImage(oversized, 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum size');
    });

    it('should reject unsupported content types', () => {
      const buf = Buffer.from('data');
      const result = validateImage(buf, 'text/html');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should accept valid JPEG images', () => {
      const buf = Buffer.from('valid-image-data');
      const result = validateImage(buf, 'image/jpeg');
      expect(result.valid).toBe(true);
    });

    it('should accept valid PNG images', () => {
      const buf = Buffer.from('valid-image-data');
      const result = validateImage(buf, 'image/png');
      expect(result.valid).toBe(true);
    });

    it('should accept DICOM images', () => {
      const buf = Buffer.from('dicom-data');
      const result = validateImage(buf, 'application/dicom');
      expect(result.valid).toBe(true);
    });

    it('should accept PDF files', () => {
      const buf = Buffer.from('pdf-data');
      const result = validateImage(buf, 'application/pdf');
      expect(result.valid).toBe(true);
    });
  });

  describe('generateObjectKey', () => {
    it('should include patient ID in the key path', () => {
      const key = generateObjectKey('patient-123', 'xray.jpg');
      expect(key).toContain('patients/patient-123/images/');
    });

    it('should include sanitized file name', () => {
      const key = generateObjectKey('patient-123', 'xray.jpg');
      expect(key).toContain('xray.jpg');
    });

    it('should sanitize special characters in file name', () => {
      const key = generateObjectKey('patient-123', 'x ray (1).jpg');
      expect(key).toContain('x_ray__1_.jpg');
    });

    it('should generate unique keys for same inputs', () => {
      const key1 = generateObjectKey('patient-123', 'xray.jpg');
      const key2 = generateObjectKey('patient-123', 'xray.jpg');
      expect(key1).not.toBe(key2);
    });
  });

  describe('upload', () => {
    it('should upload image to S3 and return metadata', async () => {
      sendMock.mockResolvedValue({});
      const buf = Buffer.from('image-data');
      const result = await ImageStorageService.upload('patient-1', buf, 'scan.jpg', 'image/jpeg');

      expect(result.storageKey).toContain('patients/patient-1/images/');
      expect(result.bucket).toBe('medsecure-medical-images');
      expect(result.contentType).toBe('image/jpeg');
      expect(result.sizeBytes).toBe(buf.length);
      expect(result.url).toContain('s3://');
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('should throw validation error for empty buffer', async () => {
      await expect(
        ImageStorageService.upload('patient-1', Buffer.alloc(0), 'empty.jpg', 'image/jpeg')
      ).rejects.toThrow('Image data is empty');
    });

    it('should throw validation error for invalid content type', async () => {
      await expect(
        ImageStorageService.upload('patient-1', Buffer.from('data'), 'file.exe', 'application/exe')
      ).rejects.toThrow('not allowed');
    });

    it('should set server-side encryption to aws:kms', async () => {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      sendMock.mockResolvedValue({});
      await ImageStorageService.upload('patient-1', Buffer.from('data'), 'scan.jpg', 'image/jpeg');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ServerSideEncryption: 'aws:kms',
        })
      );
    });

    it('should include patient metadata in S3 object', async () => {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      sendMock.mockResolvedValue({});
      await ImageStorageService.upload('patient-1', Buffer.from('data'), 'scan.jpg', 'image/jpeg');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: expect.objectContaining({
            'patient-id': 'patient-1',
            'original-filename': 'scan.jpg',
          }),
        })
      );
    });
  });

  describe('getSignedUrl', () => {
    it('should return a presigned URL for the given key', async () => {
      const url = await ImageStorageService.getSignedUrl('patients/p1/images/test.jpg');
      expect(url).toBe('https://s3.amazonaws.com/signed-url');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('should delete the object from S3', async () => {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      sendMock.mockResolvedValue({});
      await ImageStorageService.delete('patients/p1/images/test.jpg');

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'patients/p1/images/test.jpg',
        })
      );
    });
  });
});

describe('ALLOWED_MIME_TYPES', () => {
  it('should include medical imaging formats', () => {
    expect(ALLOWED_MIME_TYPES).toContain('image/dicom');
    expect(ALLOWED_MIME_TYPES).toContain('application/dicom');
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
  });
});
