exports.up = function(knex) {
  return knex.schema.createTable('baa_agreements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('provider_id').notNullable().index();
    table.string('vendor_name').notNullable();
    table.text('description').nullable();
    table.date('agreement_date').notNullable();
    table.date('expiration_date').notNullable();
    table.string('status').notNullable().defaultTo('active');
    table.text('contract_reference').nullable();
    table.specificType('phi_types_shared', 'text[]').nullable();
    table.text('safeguards_required').nullable();
    table.uuid('created_by').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('baa_agreements');
};
