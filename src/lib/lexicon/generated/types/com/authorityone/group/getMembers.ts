/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as ComAuthorityoneGroupDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.authorityone.group.getMembers'

export type QueryParams = {
  group: string
  /** Optional filter to a single membership status (defaults to active). */
  status?:
    | 'com.authorityone.group.defs#active'
    | 'com.authorityone.group.defs#pending'
    | 'com.authorityone.group.defs#invited'
    | 'com.authorityone.group.defs#banned'
    | (string & {})
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  group: ComAuthorityoneGroupDefs.GroupViewBasic
  members: ComAuthorityoneGroupDefs.MemberView[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export class GroupNotFoundError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class NotAuthorizedError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'GroupNotFound') return new GroupNotFoundError(e)
    if (e.error === 'NotAuthorized') return new NotAuthorizedError(e)
  }

  return e
}
