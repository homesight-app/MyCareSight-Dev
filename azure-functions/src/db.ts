import postgres from 'postgres'
import { required } from './config.js'

export const sql = postgres(required('JOBS_DATABASE_URL'), {
  ssl: 'require',
  max: 8,
  idle_timeout: 20,
  connect_timeout: 20,
  prepare: false,
})

export type Db = typeof sql
