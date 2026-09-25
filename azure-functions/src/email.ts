import Mailgun from 'mailgun.js'
import FormData from 'form-data'
import { required } from './config.js'

const mailgun = new Mailgun(FormData)

export async function sendTaskReminder(to: string, deliveryId: string) {
  const domain=required('MAILGUN_DOMAIN')
  const from=required('MAILGUN_FROM_EMAIL')
  const appUrl=required('APP_URL').replace(/\/$/,'')
  const client=mailgun.client({ username:'api', key:required('MAILGUN_API_KEY') })
  return client.messages.create(domain, {
    from:`MyCareSight <${from}>`, to:[to], subject:'A task is due in MyCareSight',
    text:`A task is due in MyCareSight. Sign in to review it: ${appUrl}/pages/agency/leads`,
    html:`<p>A task is due in MyCareSight.</p><p><a href="${appUrl}/pages/agency/leads">Sign in to review it</a>.</p>`,
    'h:X-MyCareSight-Delivery-ID':deliveryId,
  })
}
