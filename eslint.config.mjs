import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseDirectory = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory })

const config = [
  {
    ignores: ['.next/**', 'deploy/**', 'coverage/**', 'node_modules/**'],
  },
  ...compat.extends('next/core-web-vitals'),
]

export default config

