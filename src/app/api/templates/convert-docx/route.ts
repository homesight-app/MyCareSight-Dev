import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!file.name.endsWith('.docx')) {
    return NextResponse.json({ error: 'Only .docx files are supported' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ buffer }, {
    includeEmbeddedStyleMap: true,
  })

  return NextResponse.json({ html: result.value, messages: result.messages })
}
