/**
 * Prints the Postgres version and the tables in the `public` schema.
 * Used to confirm a migration actually landed on the running container.
 */
import { pool } from './client.ts'

const { rows: [version] } = await pool.query<{ version: string }>(
  'select version() as version',
)

const { rows: tables } = await pool.query<{ table_name: string }>(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`)

console.log(version?.version ?? 'unknown server version')
console.log(
  tables.length
    ? `public tables:\n${tables.map(t => `  - ${t.table_name}`).join('\n')}`
    : 'public tables: none',
)

await pool.end()
