import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

// Credentials live in one place: the repo-root .env, shared with docker-compose.yml.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const url = process.env.DATABASE_URL

if (!url)
  throw new Error('DATABASE_URL is not set — copy .env.example to .env at the repo root.')

export const DATABASE_URL = url
