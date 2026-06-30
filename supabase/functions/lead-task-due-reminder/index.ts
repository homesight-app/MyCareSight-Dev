/**
 * Daily lead task due-date reminder.
 * Runs once per day (recommended: 8:00 AM UTC — cron `0 8 * * *`).
 * For every lead task where due_date = today AND completed_at IS NULL:
 *   1. Inserts an in-app notification for the task creator (and assignee, if different).
 *   2. Sends an email via Resend to each notified user.
 *
 * Secrets required (set via `supabase secrets set` or Supabase Dashboard):
 *   CRON_SECRET              — Bearer token used by the scheduler
 *   SUPABASE_URL             — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 *   RESEND_API_KEY           — Resend API key
 *   APP_URL                  — e.g. https://app.mycaresight.com (no trailing slash)
 *                              Falls back to NEXT_PUBLIC_APP_URL if APP_URL is not set.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskRow = {
  id: string
  title: string
  due_date: string
  lead_id: string
  created_by: string
  assigned_to: string | null
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
}

type LeadRow = {
  id: string
  lead_type: string
  contact_first_name: string | null
  contact_last_name: string | null
  company_name: string | null
}

type NotificationInsert = {
  user_id: string
  title: string
  message: string
  type: string
  icon_type: string
}

// ─── Email helpers ────────────────────────────────────────────────────────────

function buildEmailHtml(p: {
  recipientName: string | null
  taskTitle: string
  leadName: string
  dueDate: string
  leadUrl: string
}): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Due Today</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #0F172A; padding: 24px 30px; border-radius: 10px 10px 0 0; text-align: center;">
      <h1 style="color: #22C55E; margin: 0; font-size: 22px;">MyCareSight</h1>
    </div>
    <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
      <p style="font-size: 16px;">Hi ${p.recipientName || 'there'},</p>
      <p style="font-size: 16px;">You have a task due today:</p>
      <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0;">
        <p style="margin: 0; font-size: 18px; font-weight: bold; color: #1f2937;">${p.taskTitle}</p>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">Lead: ${p.leadName}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Due: ${p.dueDate}</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${p.leadUrl}"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
          View Lead →
        </a>
      </div>
      <p style="font-size: 14px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        This is an automated reminder from MyCareSight.
      </p>
    </div>
  </body>
</html>`.trim()
}

function buildEmailText(p: {
  recipientName: string | null
  taskTitle: string
  leadName: string
  dueDate: string
  leadUrl: string
}): string {
  return `Hi ${p.recipientName || 'there'},

You have a task due today:

Task: ${p.taskTitle}
Lead: ${p.leadName}
Due:  ${p.dueDate}

View the lead: ${p.leadUrl}

This is an automated reminder from MyCareSight.`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Auth
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret?.length) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const appUrl = (
    Deno.env.get('APP_URL') ??
    Deno.env.get('NEXT_PUBLIC_APP_URL') ??
    'https://app.mycaresight.com'
  ).replace(/\/$/, '')

  const supabase = createClient(supabaseUrl, serviceKey)
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const startedAt = Date.now()
  console.log('[lead-task-due-reminder] start', { today })

  // ── 1. Fetch tasks due today that are not yet completed ─────────────────────
  const { data: tasks, error: tasksErr } = await supabase
    .from('lead_tasks')
    .select('id, title, due_date, lead_id, created_by, assigned_to')
    .eq('due_date', today)
    .is('completed_at', null)

  if (tasksErr) {
    console.error('[lead-task-due-reminder] tasks query error', tasksErr)
    return new Response(JSON.stringify({ error: tasksErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const taskList = (tasks ?? []) as TaskRow[]
  console.log('[lead-task-due-reminder] tasks due today', { count: taskList.length })

  if (taskList.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, today, tasksDue: 0, durationMs: Date.now() - startedAt }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 2. Fetch user profiles and lead names in bulk ───────────────────────────
  const userIdSet = new Set<string>()
  for (const t of taskList) {
    userIdSet.add(t.created_by)
    if (t.assigned_to) userIdSet.add(t.assigned_to)
  }
  const userIds = [...userIdSet]
  const leadIds = [...new Set(taskList.map(t => t.lead_id))]

  const [profilesRes, leadsRes] = await Promise.all([
    supabase.from('user_profiles').select('id, email, full_name').in('id', userIds),
    supabase.from('leads').select('id, lead_type, contact_first_name, contact_last_name, company_name').in('id', leadIds),
  ])

  const profileMap = Object.fromEntries(
    ((profilesRes.data ?? []) as ProfileRow[]).map(p => [p.id, p])
  )
  const leadMap = Object.fromEntries(
    ((leadsRes.data ?? []) as LeadRow[]).map(l => [l.id, l])
  )

  // ── 3. Fan out: one notification + email per (task, recipient) pair ─────────
  const notifications: NotificationInsert[] = []
  const errors: string[] = []
  let emailsSent = 0

  for (const task of taskList) {
    const lead = leadMap[task.lead_id]
    const leadName = lead
      ? `${lead.contact_first_name ?? ''} ${lead.contact_last_name ?? ''}`.trim() || lead.company_name || 'Unknown Lead'
      : 'Unknown Lead'

    // Link goes to the right role's route based on lead_type
    const rolePrefix = lead?.lead_type === 'patient' ? 'agency' : 'admin'
    const leadUrl = `${appUrl}/pages/${rolePrefix}/leads/${task.lead_id}`

    // Deduplicate creator + assignee
    const recipientIds = new Set<string>([task.created_by])
    if (task.assigned_to && task.assigned_to !== task.created_by) {
      recipientIds.add(task.assigned_to)
    }

    for (const userId of recipientIds) {
      const profile = profileMap[userId]
      if (!profile) {
        errors.push(`task ${task.id}: user profile not found for ${userId}`)
        continue
      }

      // In-app notification
      notifications.push({
        user_id: userId,
        title: `Task due today: ${task.title}`,
        message: `Your task "${task.title}" for ${leadName} is due today.`,
        type: 'general',
        icon_type: 'bell',
      })

      // Email (skip if no email address or no API key)
      if (!profile.email || !resendApiKey) continue

      const emailParams = {
        recipientName: profile.full_name,
        taskTitle: task.title,
        leadName,
        dueDate: task.due_date,
        leadUrl,
      }

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MyCareSight <onboarding@resend.dev>',
            to: profile.email.trim(),
            subject: `Task Due Today: ${task.title}`,
            html: buildEmailHtml(emailParams),
            text: buildEmailText(emailParams),
          }),
        })
        if (res.ok) {
          emailsSent++
        } else {
          const body = await res.text()
          errors.push(`email to ${profile.email} (task ${task.id}): ${res.status} ${body}`)
        }
      } catch (err) {
        errors.push(`email to ${profile.email} (task ${task.id}): ${String(err)}`)
      }
    }
  }

  // ── 4. Batch-insert notifications ──────────────────────────────────────────
  if (notifications.length > 0) {
    const { error: notifErr } = await supabase.from('notifications').insert(notifications)
    if (notifErr) {
      errors.push(`notifications insert: ${notifErr.message}`)
    }
  }

  const durationMs = Date.now() - startedAt
  const result = {
    ok: true,
    today,
    tasksDue: taskList.length,
    notificationsQueued: notifications.length,
    emailsSent,
    durationMs,
    errors: errors.length ? errors : undefined,
  }
  console.log('[lead-task-due-reminder] done', result)

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
