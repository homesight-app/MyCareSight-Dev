import 'server-only'
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'
import { Readable } from 'node:stream'
import {
  measureStorageOperation,
  storageSizeClass,
} from '@/lib/observability/performance'

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!
const accountUrl = `https://${accountName}.blob.core.windows.net`

// DefaultAzureCredential: Azure CLI locally, Managed Identity on App Service.
// No account key or connection string needed.
const credential = new DefaultAzureCredential()
const blobServiceClient = new BlobServiceClient(accountUrl, credential)

function containerClient(bucket: string) {
  return blobServiceClient.getContainerClient(bucket)
}

function normalizeBlobPath(bucket: string, path: string) {
  if (!path.includes('/storage/v1/object/')) return path
  const marker = `/object/public/${bucket}/`
  const idx = path.indexOf(marker)
  return idx !== -1 ? path.slice(idx + marker.length) : path
}

/** Upload a file to an Azure Blob Storage container. Returns the stored path or an error. */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob | Buffer | ArrayBuffer,
  options?: { upsert?: boolean; contentType?: string }
): Promise<{ path: string | null; error: Error | null }> {
  try {
    const blockBlob = containerClient(bucket).getBlockBlobClient(path)
    let data: Buffer | ArrayBuffer
    if (file instanceof File || file instanceof Blob) {
      data = await file.arrayBuffer()
    } else {
      data = file
    }
    const bytes = file instanceof File || file instanceof Blob
      ? file.size
      : Buffer.isBuffer(file)
        ? file.byteLength
        : file.byteLength
    await measureStorageOperation('upload', storageSizeClass(bytes), () =>
      blockBlob.uploadData(data, {
        blobHTTPHeaders: {
          blobContentType: options?.contentType ?? (file instanceof File ? file.type : undefined),
        },
      })
    )
    return { path, error: null }
  } catch (err) {
    return { path: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** Remove one or more blobs from an Azure Blob Storage container. */
export async function removeFiles(
  bucket: string,
  paths: string[]
): Promise<{ error: Error | null }> {
  if (paths.length === 0) return { error: null }
  try {
    const container = containerClient(bucket)
    await measureStorageOperation('delete', 'unknown', () =>
      Promise.all(paths.map(p => container.deleteBlob(p).catch(() => null)))
    )
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
  }
}

export type DownloadedFile = {
  stream: ReadableStream<Uint8Array>
  contentLength: number
  contentType: string | null
}

/** Download a bounded private object for an authorized server-side use. */
export async function downloadFile(
  bucket: string,
  path: string,
  maxBytes: number
): Promise<DownloadedFile | null> {
  if (!path || !Number.isSafeInteger(maxBytes) || maxBytes < 1) return null

  try {
    const blob = containerClient(bucket).getBlockBlobClient(normalizeBlobPath(bucket, path))
    const properties = await blob.getProperties()
    const bytes = properties.contentLength
    if (bytes === undefined || bytes < 1 || bytes > maxBytes) return null

    const response = await measureStorageOperation('download', storageSizeClass(bytes), () =>
      blob.download(0, bytes)
    )
    if (!response.readableStreamBody) return null

    return {
      stream: Readable.toWeb(response.readableStreamBody as Readable) as ReadableStream<Uint8Array>,
      contentLength: bytes,
      contentType: properties.contentType ?? null,
    }
  } catch {
    // Provider errors can include blob URLs or paths. Do not forward them.
    console.error('[storage] downloadFile failed')
    return null
  }
}

/**
 * Generate a time-limited User Delegation SAS URL for a private blob.
 * Uses Managed Identity / DefaultAzureCredential — no account key required.
 * Returns null on failure.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null

  // Strip legacy Supabase full-URL paths stored in the DB.
  const blobPath = normalizeBlobPath(bucket, path)

  try {
    return await measureStorageOperation('sign_url', 'unknown', async () => {
      const startsOn = new Date()
      const expiresOn = new Date(Date.now() + expiresIn * 1000)

      const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn)

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: bucket,
          blobName: blobPath,
          permissions: BlobSASPermissions.parse('r'),
          startsOn,
          expiresOn,
        },
        userDelegationKey,
        accountName
      ).toString()

      return `${accountUrl}/${bucket}/${blobPath}?${sasToken}`
    })
  } catch (err) {
    // Provider errors can include blob URLs or paths. The timing span already
    // records failure status without forwarding provider details.
    console.error('[storage] getSignedUrl failed')
    return null
  }
}
