import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [entryPath] : []
  })
}

describe('UAT Supabase runtime removal', () => {
  it('has no Supabase SDK, runtime credential, or Realtime usage in application source', () => {
    const forbidden = [
      /@supabase\//,
      /NEXT_PUBLIC_SUPABASE_/,
      /SUPABASE_SERVICE_ROLE_KEY/,
      /postgres_changes/,
      /\.channel\s*\(/,
    ]

    const violations = sourceFiles(path.join(root, 'src'))
      .filter((file) => path.basename(file) !== 'supabase-runtime-removal.test.ts')
      .flatMap((file) => {
      const contents = fs.readFileSync(file, 'utf8')
      return forbidden
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path.relative(root, file)}: ${pattern.source}`)
      })

    expect(violations).toEqual([])
  })

  it('does not declare Supabase packages or UAT build credentials', () => {
    const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    const workflow = fs.readFileSync(
      path.join(root, '.github', 'workflows', 'main_mycaresight-uat.yml'),
      'utf8'
    )

    expect(packageJson).not.toMatch(/@supabase\//)
    expect(workflow).not.toMatch(/SUPABASE_/)
  })
})
