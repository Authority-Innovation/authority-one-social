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
import type * as ComAuthorityoneGroupDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.authorityone.group.membership'

export interface Main {
  $type: 'com.authorityone.group.membership'
  subject: ComAtprotoRepoStrongRef.Main
  role?: ComAuthorityoneGroupDefs.Role
  status?: ComAuthorityoneGroupDefs.MembershipStatus
  /** DID of the admin whose invite this membership claims to redeem (for invite/request groups). Audit aid; the AppView validates against the actual invite record. */
  invitedBy?: string
  /** DID of the admin who approved a request, if recorded client-side. Audit aid only. */
  approvedBy?: string
  /** When the member created this record (joined-at for active memberships). */
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
