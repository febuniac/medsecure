exports.up = function(knex) {
  return knex.schema.createTable('provider_patient_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('provider_id').notNullable().index();
    table.uuid('patient_id').notNullable().index();
    table.uuid('assigned_by').notNullable();
    table.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
    table.string('status').notNullable().defaultTo('active');
    table.uuid('revoked_by').nullable();
    table.timestamp('revoked_at').nullable();
    table.unique(['provider_id', 'patient_id', 'status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('provider_patient_assignments');
};
