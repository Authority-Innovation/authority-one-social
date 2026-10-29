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
const id = 'com.authorityone.group.post'

export interface Main {
  $type: 'com.authorityone.group.post'
  subject: ComAtprotoRepoStrongRef.Main
  group: GroupRef
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

export interface GroupRef {
  $type?: 'com.authorityone.group.post#groupRef'
  uri: string
  cid?: string
}

const hashGroupRef = 'groupRef'

export function isGroupRef<V>(v: V) {
  return is$typed(v, id, hashGroupRef)
}

export function validateGroupRef<V>(v: V) {
  return validate<GroupRef & V>(v, id, hashGroupRef)
}
