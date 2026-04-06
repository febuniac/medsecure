const {
  StorageService,
  StorageError,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  generateObjectKey,
} = require('../src/services/storageService');

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3', () => {
  const sendMock = jest.fn().mockResolvedValue({});
  const S3ClientMock = jest.fn().mockImplementation(() => ({ send: sendMock }));
  return {
    S3Client: S3ClientMock,
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'PutObject' })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'GetObject' })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObject' })),
    __sendMock: sendMock,
    __S3ClientMock: S3ClientMock,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/presigned-url'),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { __sendMock: sendMock } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService();
  });

  describe('validateFile', () => {
    it('should accept a valid JPEG file', () => {
      const buffer = Buffer.alloc(1024, 'x');
      expect(() => service.validateFile(buffer, 'image/jpeg', 'test.jpg')).not.toThrow();
    });

    it('should accept a valid PNG file', () => {
      const buffer = Buffer.alloc(1024, 'x');
      expect(() => service.validateFile(buffer, 'image/png', 'test.png')).not.toThrow();
    });

    it('should accept a valid DICOM file', () => {
      const buffer = Buffer.alloc(1024, 'x');
      expect(() => service.validateFile(buffer, 'application/dicom', 'scan.dcm')).not.toThrow();
    });

    it('should accept a valid PDF file', () => {
      const buffer = Buffer.alloc(1024, 'x');
      expect(() => service.validateFile(buffer, 'application/pdf', 'report.pdf')).not.toThrow();
    });

    it('should reject an empty file', () => {
      const buffer = Buffer.alloc(0);
      expect(() => service.validateFile(buffer, 'image/jpeg', 'test.jpg')).toThrow(StorageError);
      expect(() => service.validateFile(buffer, 'image/jpeg', 'test.jpg')).toThrow('File is empty');
    });

    it('should reject a null file', () => {
      expect(() => service.validateFile(null, 'image/jpeg', 'test.jpg')).toThrow(StorageError);
    });

    it('should reject a file exceeding max size', () => {
      const buffer = Buffer.alloc(MAX_FILE_SIZE + 1, 'x');
      expect(() => service.validateFile(buffer, 'image/jpeg', 'big.jpg')).toThrow(StorageError);
      expect(() => service.validateFile(buffer, 'image/jpeg', 'big.jpg')).toThrow('exceeds maximum size');
    });

    it('should reject disallowed MIME types', () => {
      const buffer = Buffer.alloc(1024, 'x');
      expect(() => service.validateFile(buffer, 'text/html', 'test.html')).toThrow(StorageError);
      expect(() => service.validateFile(buffer, 'text/html', 'test.html')).toThrow('not allowed');
    });

    it('should reject executable MIME types', () => {
      const buffer = Buffer.alloc(1024, 'x');
      expect(() => service.validateFile(buffer, 'application/x-executable', 'malware.exe')).toThrow(StorageError);
    });
  });

  describe('upload', () => {
    it('should upload a file and return storage metadata', async () => {
      const buffer = Buffer.from('fake-image-data');
      const result = await service.upload(buffer, 'image/jpeg', 'rec-123', 'xray.jpg');

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('storage_key');
      expect(result).toHaveProperty('storage_bucket');
      expect(result.file_size).toBe(buffer.length);
      expect(result.mime_type).toBe('image/jpeg');
      expect(result.original_filename).toBe('xray.jpg');
      expect(result.storage_key).toContain('medical-images/');
      expect(result.storage_key).toContain('rec-123');
      expect(result.storage_key).toEndWith('.jpg');
    });

    it('should set ServerSideEncryption to aws:kms', async () => {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const buffer = Buffer.from('fake-image-data');
      await service.upload(buffer, 'image/png', 'rec-456', 'scan.png');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ServerSideEncryption: 'aws:kms',
          ContentType: 'image/png',
        })
      );
    });

    it('should reject invalid files during upload', async () => {
      await expect(
        service.upload(Buffer.alloc(0), 'image/jpeg', 'rec-123', 'empty.jpg')
      ).rejects.toThrow(StorageError);
    });

    it('should handle S3 upload errors', async () => {
      sendMock.mockRejectedValueOnce(new Error('S3 connection failed'));
      const buffer = Buffer.from('fake-image-data');

      await expect(
        service.upload(buffer, 'image/jpeg', 'rec-123', 'test.jpg')
      ).rejects.toThrow('S3 connection failed');
    });

    it('should use default filename when none is provided', async () => {
      const buffer = Buffer.from('fake-image-data');
      const result = await service.upload(buffer, 'image/jpeg', 'rec-123', undefined);

      expect(result.original_filename).toBe('unknown');
    });
  });

  describe('getPresignedUrl', () => {
    it('should return a presigned URL', async () => {
      const url = await service.getPresignedUrl('medical-images/2026/01/01/rec-123/img.jpg');

      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      expect(url).toBe('https://s3.amazonaws.com/bucket/presigned-url');
    });
  });

  describe('delete', () => {
    it('should delete an object from S3', async () => {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

      await service.delete('medical-images/2026/01/01/rec-123/img.jpg');

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'medical-images/2026/01/01/rec-123/img.jpg',
        })
      );
    });
  });
});

describe('generateObjectKey', () => {
  it('should include the record ID in the key', () => {
    const key = generateObjectKey('rec-123', 'test.jpg');
    expect(key).toContain('rec-123');
  });

  it('should preserve the file extension', () => {
    const key = generateObjectKey('rec-123', 'scan.dcm');
    expect(key).toEndWith('.dcm');
  });

  it('should include a date prefix', () => {
    const key = generateObjectKey('rec-123', 'test.jpg');
    expect(key).toMatch(/medical-images\/\d{4}\/\d{2}\/\d{2}\//);
  });

  it('should generate unique keys for the same inputs', () => {
    const key1 = generateObjectKey('rec-123', 'test.jpg');
    const key2 = generateObjectKey('rec-123', 'test.jpg');
    expect(key1).not.toBe(key2);
  });

  it('should use .bin extension when filename is missing', () => {
    const key = generateObjectKey('rec-123', undefined);
    expect(key).toEndWith('.bin');
  });
});

describe('StorageError', () => {
  it('should have the correct properties', () => {
    const err = new StorageError('EMPTY_FILE', 'File is empty');
    expect(err.name).toBe('StorageError');
    expect(err.code).toBe('EMPTY_FILE');
    expect(err.message).toBe('File is empty');
    expect(err.status).toBe(400);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ALLOWED_MIME_TYPES', () => {
  it('should include common medical image types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain('image/dicom');
    expect(ALLOWED_MIME_TYPES).toContain('application/dicom');
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
  });

  it('should not include executable types', () => {
    expect(ALLOWED_MIME_TYPES).not.toContain('application/x-executable');
    expect(ALLOWED_MIME_TYPES).not.toContain('text/html');
  });
});

expect.extend({
  toEndWith(received, suffix) {
    const pass = received.endsWith(suffix);
    return {
      pass,
      message: () => `expected "${received}" to end with "${suffix}"`,
    };
  },
});
