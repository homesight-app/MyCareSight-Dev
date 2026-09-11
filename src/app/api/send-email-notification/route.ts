import { NextRequest, NextResponse } from 'next/server'
import { sendDocumentUploadNotification } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      expertEmail,
      expertName,
      ownerName,
      applicationName,
      documentName,
      applicationId
    } = body

    // Validate required fields
    if (!expertEmail || !applicationName || !documentName || !applicationId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const result = await sendDocumentUploadNotification({
      expertEmail,
      expertName,
      ownerName,
      applicationName,
      documentName,
      applicationId
    })

    if (result.success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error in email notification API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
