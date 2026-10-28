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
import type * as ComAuthorityoneGroupDefs from './defs.js'
import type * as AppBskyRichtextFacet from '../../../app/bsky/richtext/facet.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.authorityone.group.profile'

export interface Main {
  $type: 'com.authorityone.group.profile'
  /** Display name of the group. */
  name: string
  purpose?: ComAuthorityoneGroupDefs.Purpose
  description?: string
  descriptionFacets?: AppBskyRichtextFacet.Main[]
  visibility?: ComAuthorityoneGroupDefs.Visibility
  admissionPolicy?: ComAuthorityoneGroupDefs.AdmissionPolicy
  postingPolicy?: ComAuthorityoneGroupDefs.PostingPolicy
  avatar?: BlobRef
  banner?: BlobRef
  /** DID of the human/agent who created the group. Usually equals the hosting repo DID; recorded explicitly for org-hosted groups. */
  createdBy?: string
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
