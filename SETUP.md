# Quick Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Neon and Azure Storage

1. Obtain access to the designated Neon development branch.
2. Apply the ordered scripts in `scripts/migrations/`.
3. Obtain access to the designated private Azure Storage account.

## 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
DATABASE_URL=postgresql://runtime-role:password@your-neon-host/your-database?sslmode=require
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_URL=http://localhost:3000
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 4. Run Database Migration

Follow `docs/migrations/uat-supabase-removal.md` and run each required script against the intended Neon branch. Do not apply UAT migrations to production as part of this work.

## 5. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 6. Create Your First User

You can create a user by:
- Using the signup page at `/signup`
- Or provisioning one through the application's invite/admin workflow

## Notes

- The demo credentials on the login page are for UI testing only
- Test users must exist in the Neon-backed application and must not contain PHI.

