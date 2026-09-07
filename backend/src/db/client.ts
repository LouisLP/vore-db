import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { DATABASE_URL } from '../env.ts'
import * as schema from './schema.ts'

export const pool = new Pool({ connectionString: DATABASE_URL })

export const db = drizzle(pool, { schema, casing: 'snake_case' })
