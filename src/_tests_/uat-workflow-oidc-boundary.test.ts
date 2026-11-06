import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const workflow = (name: string) =>
  fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8')

describe('UAT Azure workflow OIDC boundary', () => {
  it('binds every UAT Azure deployment job to the uat environment', () => {
    const web = workflow('main_mycaresight-uat.yml')
    const jobs = workflow('uat-background-jobs.yml')
    const infrastructure = workflow('uat-background-jobs-infra.yml')

    expect(web).toMatch(
      /validate-and-deploy:[\s\S]*?environment: uat[\s\S]*?uses: azure\/login@v2/
    )
    expect(jobs).toMatch(/deploy:[\s\S]*?environment: uat[\s\S]*?uses: azure\/login@v2/)
    expect(infrastructure).toMatch(
      /infrastructure:[\s\S]*?environment: uat[\s\S]*?uses: azure\/login@v2/
    )
  })

  it('keeps pull-request validation free of Azure token permissions', () => {
    const jobs = workflow('uat-background-jobs.yml')
    const validateJob = jobs.slice(jobs.indexOf('  validate:'), jobs.indexOf('  deploy:'))

    expect(validateJob).not.toContain('id-token: write')
    expect(validateJob).not.toContain('azure/login@')
  })
})
