/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as ComAtprotoRepoStrongRef from '../../atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.authorityone.group.ban'

export interface Main {
  $type: 'com.authorityone.group.ban'
  group: ComAtprotoRepoStrongRef.Main
  /** DID of the account being banned. */
  subject: string
  /** Optional moderator note. */
  reason?: string
  createdAt: string
  [k: string]: unknown
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain, true)
}

export {
  type Main as Record,
  isMain as isRecord,
  validateMain as validateRecord,
}
