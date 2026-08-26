import { test as setup } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { ownerAuthFile, coordinatorAuthFile, adminAuthFile } from './auth-paths'

// Ensure the .auth directory exists
const authDir = path.join(__dirname, '.auth')
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

setup('authenticate as company owner', async ({ page }) => {
  const email = process.env.TEST_OWNER_EMAIL
  const password = process.env.TEST_OWNER_PASSWORD
  if (!email || !password) throw new Error('TEST_OWNER_EMAIL and TEST_OWNER_PASSWORD must be set')

  await page.goto('/pages/auth/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/pages\/agency/, { timeout: 15_000 })
  await page.context().storageState({ path: ownerAuthFile })
})

setup('authenticate as care coordinator', async ({ page }) => {
  const email = process.env.TEST_COORDINATOR_EMAIL
  const password = process.env.TEST_COORDINATOR_PASSWORD
  if (!email || !password) throw new Error('TEST_COORDINATOR_EMAIL and TEST_COORDINATOR_PASSWORD must be set')

  await page.goto('/pages/auth/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/pages\/agency\/clients/, { timeout: 15_000 })
  await page.context().storageState({ path: coordinatorAuthFile })
})

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL
  const password = process.env.TEST_ADMIN_PASSWORD
  if (!email || !password) throw new Error('TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set')

  await page.goto('/pages/auth/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/pages\/admin/, { timeout: 15_000 })
  await page.context().storageState({ path: adminAuthFile })
})
