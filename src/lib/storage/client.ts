import 'server-only'
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!
const accountUrl = `https://${accountName}.blob.core.windows.net`

// DefaultAzureCredential: Azure CLI locally, Managed Identity on App Service.
// No account key or connection string needed.
const credential = new DefaultAzureCredential()
const blobServiceClient = new BlobServiceClient(accountUrl, credential)

function containerClient(bucket: string) {
  return blobServiceClient.getContainerClient(bucket)
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
    await blockBlob.uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: options?.contentType ?? (file instanceof File ? file.type : undefined),
      },
    })
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
    await Promise.all(paths.map(p => container.deleteBlob(p).catch(() => null)))
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
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

  // Strip legacy Supabase full-URL paths stored in the DB
  let blobPath = path
  if (path.includes('/storage/v1/object/')) {
    const marker = `/object/public/${bucket}/`
    const idx = path.indexOf(marker)
    blobPath = idx !== -1 ? path.slice(idx + marker.length) : path
  }

  try {
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
  } catch (err) {
    console.error('[storage] getSignedUrl failed:', bucket, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Return the plain blob URL for a container with public Blob access (agency-public).
 * All other containers require getSignedUrl() instead.
 */
export function getPublicUrl(bucket: string, path: string): string {
  return `${accountUrl}/${bucket}/${path}`
}
