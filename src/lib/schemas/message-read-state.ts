import { z } from 'zod'

export const messageIdSchema = z.string().uuid()
export const messageIdsSchema = z.array(messageIdSchema).max(5000).transform(ids => [...new Set(ids)])
export const unreadLimitSchema = z.number().int().min(0).max(5000)
