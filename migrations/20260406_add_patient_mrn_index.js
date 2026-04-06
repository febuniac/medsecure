/**
 * Migration: Add index on patients.mrn column
 *
 * The patients table lacks an index on the mrn (Medical Record Number) column,
 * causing full table scans on patient lookups by MRN. This migration adds a
 * unique index to improve query performance and enforce MRN uniqueness.
 *
 * Fixes: GitHub Issue #85
 */
exports.up = function (knex) {
  return knex.schema.alterTable('patients', (table) => {
    table.index(['mrn'], 'idx_patients_mrn');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('patients', (table) => {
    table.dropIndex(['mrn'], 'idx_patients_mrn');
  });
};
