import { DefaultAzureCredential } from '@azure/identity'
import { QueueClient, QueueServiceClient } from '@azure/storage-queue'
import { queueName } from './config.js'

function client(): QueueClient {
  const connection = process.env.AzureWebJobsStorage?.trim()
  if (connection) {
    return QueueServiceClient.fromConnectionString(connection).getQueueClient(queueName)
  }
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim()
  if (!account) throw new Error('Missing AZURE_STORAGE_ACCOUNT_NAME')
  return new QueueClient(
    `https://${account}.queue.core.windows.net/${queueName}`,
    new DefaultAzureCredential()
  )
}

let cached: QueueClient | null = null
export function jobQueue(): QueueClient {
  cached ??= client()
  return cached
}
