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
const id = 'com.authorityone.community.config'

export interface Main {
  $type: 'com.authorityone.community.config'
  community: ComAtprotoRepoStrongRef.Main
  /** Access tier of the community. */
  tier:
    | 'com.authorityone.community.config#public'
    | 'com.authorityone.community.config#members'
    | 'com.authorityone.community.config#paid'
    | (string & {})
  /** Whether the community appears in the directory. Defaults to listed if absent. */
  listing?:
    | 'com.authorityone.community.config#listed'
    | 'com.authorityone.community.config#unlisted'
    | (string & {})
  theme?: Theme
  brand?: Brand
  /** DID of the community's agent account, if any. Clients label agent content from this DID plus the runtime is_agent flag, never from a handle suffix. */
  agent?: string
  /** DID of the account accountable for the agent. Required when agent is set (enforced by the AppView; lexicon cannot express conditional requirements). */
  agentSponsor?: string
  moderation?: Moderation
  /** Optional age notice shown before entry. */
  ageNotice?: string
  /** Version of the consent wording members agree to. Matches the tenant ledger's wording_version. */
  consentVersion: number
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

/** Community header theme. Applied to the community header only, never as a whole-app reskin. */
export interface Theme {
  $type?: 'com.authorityone.community.config#theme'
  /** Primary color, CSS hex (e.g. #RRGGBB). */
  primary?: string
  /** Accent color, CSS hex. */
  accent?: string
  /** Background color, CSS hex. */
  background?: string
  logo?: BlobRef
  icon?: BlobRef
  /** Text wordmark shown in the community header. */
  wordmark?: string
}

const hashTheme = 'theme'

export function isTheme<V>(v: V) {
  return is$typed(v, id, hashTheme)
}

export function validateTheme<V>(v: V) {
  return validate<Theme & V>(v, id, hashTheme)
}

export interface Brand {
  $type?: 'com.authorityone.community.config#brand'
  displayName?: string
  legalName?: string
  supportUrl?: string
  termsUrl?: string
  privacyUrl?: string
}

const hashBrand = 'brand'

export function isBrand<V>(v: V) {
  return is$typed(v, id, hashBrand)
}

export function validateBrand<V>(v: V) {
  return validate<Brand & V>(v, id, hashBrand)
}

export interface Moderation {
  $type?: 'com.authorityone.community.config#moderation'
  /** DIDs of labeler services applied to this community. */
  labelers?: string[]
  /** DID of the moderation service that receives reports for this community. */
  reportTo?: string
  rulesUrl?: string
}

const hashModeration = 'moderation'

export function isModeration<V>(v: V) {
  return is$typed(v, id, hashModeration)
}

export function validateModeration<V>(v: V) {
  return validate<Moderation & V>(v, id, hashModeration)
}

/** Readable by anyone. */
export const PUBLIC = `${id}#public`
/** Readable by effective members only. Members content is served off-protocol and never written to a PDS. */
export const MEMBERS = `${id}#members`
/** Members tier gated by a paid entitlement. */
export const PAID = `${id}#paid`
/** Appears in directory/search. */
export const LISTED = `${id}#listed`
/** Reachable by direct link only. */
export const UNLISTED = `${id}#unlisted`
