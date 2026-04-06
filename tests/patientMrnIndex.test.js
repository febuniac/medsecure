const migration = require('../migrations/20260406_add_patient_mrn_index');

describe('Migration: add patient MRN index', () => {
  it('should add idx_patients_mrn index on patients.mrn in up migration', async () => {
    const mockTable = {
      index: jest.fn(),
    };
    const mockKnex = {
      schema: {
        alterTable: jest.fn((tableName, callback) => {
          callback(mockTable);
          return Promise.resolve();
        }),
      },
    };

    await migration.up(mockKnex);

    expect(mockKnex.schema.alterTable).toHaveBeenCalledWith('patients', expect.any(Function));
    expect(mockTable.index).toHaveBeenCalledWith(['mrn'], 'idx_patients_mrn');
  });

  it('should drop idx_patients_mrn index in down migration', async () => {
    const mockTable = {
      dropIndex: jest.fn(),
    };
    const mockKnex = {
      schema: {
        alterTable: jest.fn((tableName, callback) => {
          callback(mockTable);
          return Promise.resolve();
        }),
      },
    };

    await migration.down(mockKnex);

    expect(mockKnex.schema.alterTable).toHaveBeenCalledWith('patients', expect.any(Function));
    expect(mockTable.dropIndex).toHaveBeenCalledWith(['mrn'], 'idx_patients_mrn');
  });
});
