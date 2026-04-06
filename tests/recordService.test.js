const RecordService = require('../src/services/recordService');
const ImageAttachmentService = require('../src/services/imageAttachmentService');
const db = require('../src/models/db');

jest.mock('../src/models/db', () => {
  const mKnex = jest.fn();
  return mKnex;
});

jest.mock('../src/services/imageAttachmentService', () => ({
  upload: jest.fn(),
}));

jest.mock('../src/services/providerPatientService', () => ({
  verifyAccess: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe('RecordService', () => {
  const mockUser = { id: 'user-1', provider_id: 'provider-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should strip image BLOB fields and upload them to S3', async () => {
      const mockRecord = { id: 'record-1', patient_id: 'patient-1', created_by: 'user-1' };

      const recordQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockRecord]),
      };
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { id: 'att-1', storage_url: 's3://bucket/key', content_type: 'image/jpeg' },
        ]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      ImageAttachmentService.upload.mockResolvedValue({ id: 'att-1' });

      const data = {
        patient_id: 'patient-1',
        image_data: Buffer.from('fake image data').toString('base64'),
        image_data_content_type: 'image/jpeg',
        image_data_name: 'xray.jpg',
        diagnosis: 'normal',
      };

      const result = await RecordService.create(data, mockUser);

      // Image data should NOT be in the insert call
      expect(recordQuery.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({ image_data: expect.anything() })
      );

      // Image should be uploaded to S3 via ImageAttachmentService
      expect(ImageAttachmentService.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          recordId: 'record-1',
          patientId: 'patient-1',
          contentType: 'image/jpeg',
          originalName: 'xray.jpg',
        })
      );

      // Result should include image attachment references
      expect(result.image_attachments).toBeDefined();
      expect(result.image_attachments).toHaveLength(1);
      expect(result.image_attachments[0].storage_url).toContain('s3://');
    });

    it('should handle records without image data normally', async () => {
      const mockRecord = { id: 'record-2', patient_id: 'patient-1', created_by: 'user-1' };

      const recordQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockRecord]),
      };
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      const data = {
        patient_id: 'patient-1',
        diagnosis: 'normal checkup',
        notes: 'Patient is healthy',
      };

      const result = await RecordService.create(data, mockUser);

      expect(ImageAttachmentService.upload).not.toHaveBeenCalled();
      expect(result.image_attachments).toEqual([]);
    });

    it('should handle multiple image fields in a single record', async () => {
      const mockRecord = { id: 'record-3', patient_id: 'patient-1', created_by: 'user-1' };

      const recordQuery = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockRecord]),
      };
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { id: 'att-1' },
          { id: 'att-2' },
        ]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      ImageAttachmentService.upload.mockResolvedValue({ id: 'att-1' });

      const data = {
        patient_id: 'patient-1',
        image_data: Buffer.from('image1').toString('base64'),
        dicom_data: Buffer.from('dicom1').toString('base64'),
      };

      await RecordService.create(data, mockUser);

      expect(ImageAttachmentService.upload).toHaveBeenCalledTimes(2);

      // Both BLOB fields should be stripped from the insert
      expect(recordQuery.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({
          image_data: expect.anything(),
          dicom_data: expect.anything(),
        })
      );
    });
  });

  describe('getByPatient', () => {
    it('should return paginated records with image attachment references', async () => {
      const mockRecords = [
        { id: 'record-1', patient_id: 'patient-1' },
        { id: 'record-2', patient_id: 'patient-1' },
      ];

      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(mockRecords),
        count: jest.fn().mockResolvedValue([{ count: '2' }]),
      };

      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      const result = await RecordService.getByPatient('patient-1', mockUser);

      expect(result.data).toHaveLength(2);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
      result.data.forEach((record) => {
        expect(record.image_attachments).toBeDefined();
      });
    });

    it('should apply custom page and limit parameters', async () => {
      const mockRecords = [
        { id: 'record-3', patient_id: 'patient-1' },
      ];

      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(mockRecords),
        count: jest.fn().mockResolvedValue([{ count: '15' }]),
      };

      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      const result = await RecordService.getByPatient('patient-1', mockUser, { page: 2, limit: 5 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('should return empty data array with correct pagination when no records exist', async () => {
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue([{ count: '0' }]),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        return {};
      });

      const result = await RecordService.getByPatient('patient-1', mockUser, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('getById', () => {
    it('should return record with image attachment references', async () => {
      const mockRecord = { id: 'record-1', patient_id: 'patient-1' };
      const mockAttachments = [
        { id: 'att-1', storage_url: 's3://bucket/key1', content_type: 'image/jpeg' },
      ];

      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockRecord),
      };
      const attachmentQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockAttachments),
      };

      db.mockImplementation((table) => {
        if (table === 'medical_records') return recordQuery;
        if (table === 'image_attachments') return attachmentQuery;
        return {};
      });

      const result = await RecordService.getById('record-1', mockUser);

      expect(result.image_attachments).toHaveLength(1);
      expect(result.image_attachments[0].storage_url).toContain('s3://');
    });

    it('should return undefined for non-existent record', async () => {
      const recordQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
      };

      db.mockImplementation(() => recordQuery);

      const result = await RecordService.getById('nonexistent', mockUser);

      expect(result).toBeUndefined();
    });
  });

  describe('_extractImageFields', () => {
    it('should extract base64-encoded image data fields', () => {
      const data = {
        patient_id: 'p1',
        image_data: Buffer.from('test').toString('base64'),
        image_data_content_type: 'image/png',
        image_data_name: 'scan.png',
        diagnosis: 'normal',
      };

      const extracted = RecordService._extractImageFields(data);

      expect(extracted).toHaveLength(1);
      expect(extracted[0].fieldName).toBe('image_data');
      expect(extracted[0].contentType).toBe('image/png');
      expect(extracted[0].originalName).toBe('scan.png');
      expect(Buffer.isBuffer(extracted[0].buffer)).toBe(true);

      // Original data should have blob fields removed
      expect(data.image_data).toBeUndefined();
      expect(data.image_data_content_type).toBeUndefined();
      expect(data.image_data_name).toBeUndefined();
      // Non-blob fields should remain
      expect(data.diagnosis).toBe('normal');
      expect(data.patient_id).toBe('p1');
    });

    it('should extract Buffer image data fields', () => {
      const data = {
        image_data: Buffer.from('raw binary data'),
      };

      const extracted = RecordService._extractImageFields(data);

      expect(extracted).toHaveLength(1);
      expect(Buffer.isBuffer(extracted[0].buffer)).toBe(true);
    });

    it('should return empty array when no image fields present', () => {
      const data = { patient_id: 'p1', diagnosis: 'normal' };

      const extracted = RecordService._extractImageFields(data);

      expect(extracted).toHaveLength(0);
    });

    it('should handle all known BLOB field names', () => {
      const data = {
        image_data: Buffer.from('1').toString('base64'),
        attachment_data: Buffer.from('2').toString('base64'),
        file_data: Buffer.from('3').toString('base64'),
        image: Buffer.from('4').toString('base64'),
        dicom_data: Buffer.from('5').toString('base64'),
      };

      const extracted = RecordService._extractImageFields(data);

      expect(extracted).toHaveLength(5);
      expect(extracted.map((e) => e.fieldName)).toEqual([
        'image_data',
        'attachment_data',
        'file_data',
        'image',
        'dicom_data',
      ]);
    });
  });
});
