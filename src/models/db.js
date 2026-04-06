const knex = require('knex');
const { buildKnexConfig } = require('../config/database');

const db = knex(buildKnexConfig());

module.exports = db;
