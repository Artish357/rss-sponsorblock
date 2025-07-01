import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('episodes', (table) => {
    table.integer('clean_duration');
    table.text('clean_duration_source');
    table.text('transcript_url');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('episodes', (table) => {
    table.dropColumn('clean_duration');
    table.dropColumn('clean_duration_source');
    table.dropColumn('transcript_url');
  });
}