import { defineConfig } from 'drizzle-kit'
import { DATABASE_URL } from './src/env.ts'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: DATABASE_URL },
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
