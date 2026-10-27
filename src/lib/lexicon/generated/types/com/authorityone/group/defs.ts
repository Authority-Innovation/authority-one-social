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
import type * as AppBskyRichtextFacet from '../../../app/bsky/richtext/facet.js'
import type * as AppBskyActorDefs from '../../../app/bsky/actor/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.authorityone.group.defs'

/** Lightweight hydrated group view, safe to return to non-members. */
export interface GroupViewBasic {
  $type?: 'com.authorityone.group.defs#groupViewBasic'
  uri: string
  cid: string
  /** DID of the repo hosting the group record (owner of record). */
  creator: string
  name: string
  purpose?: Purpose
  visibility?: Visibility
  admissionPolicy?: AdmissionPolicy
  avatar?: string
  memberCount?: number
  viewer?: ViewerState
  indexedAt?: string
}

const hashGroupViewBasic = 'groupViewBasic'

export function isGroupViewBasic<V>(v: V) {
  return is$typed(v, id, hashGroupViewBasic)
}

export function validateGroupViewBasic<V>(v: V) {
  return validate<GroupViewBasic & V>(v, id, hashGroupViewBasic)
}

/** Full hydrated group view returned by getGroup. */
export interface GroupView {
  $type?: 'com.authorityone.group.defs#groupView'
  uri: string
  cid: string
  /** DID of the repo hosting the group record (owner of record). */
  creator: string
  name: string
  purpose?: Purpose
  description?: string
  descriptionFacets?: AppBskyRichtextFacet.Main[]
  visibility?: Visibility
  admissionPolicy?: AdmissionPolicy
  postingPolicy?: PostingPolicy
  avatar?: string
  banner?: string
  memberCount?: number
  viewer?: ViewerState
  indexedAt: string
}

const hashGroupView = 'groupView'

export function isGroupView<V>(v: V) {
  return is$typed(v, id, hashGroupView)
}

export function validateGroupView<V>(v: V) {
  return validate<GroupView & V>(v, id, hashGroupView)
}

/** Group-relative state for the requesting viewer, computed by the AppView from effective membership. */
export interface ViewerState {
  $type?: 'com.authorityone.group.defs#viewerState'
  /** URI of the viewer's own membership record, if any. */
  membership?: string
  role?: Role
  status?: MembershipStatus
  canPost?: boolean
  canJoin?: boolean
}

const hashViewerState = 'viewerState'

export function isViewerState<V>(v: V) {
  return is$typed(v, id, hashViewerState)
}

export function validateViewerState<V>(v: V) {
  return validate<ViewerState & V>(v, id, hashViewerState)
}

/** A member of a group as resolved by the AppView (effective role/status). */
export interface MemberView {
  $type?: 'com.authorityone.group.defs#memberView'
  subject: AppBskyActorDefs.ProfileView
  /** URI of the member's membership record. */
  membership?: string
  role: Role
  status: MembershipStatus
  createdAt?: string
}

const hashMemberView = 'memberView'

export function isMemberView<V>(v: V) {
  return is$typed(v, id, hashMemberView)
}

export function validateMemberView<V>(v: V) {
  return validate<MemberView & V>(v, id, hashMemberView)
}

/** One group the actor is an effective member of, with their resolved role and status. Returned by getMemberships. */
export interface MembershipView {
  $type?: 'com.authorityone.group.defs#membershipView'
  group: GroupViewBasic
  role: Role
  status: MembershipStatus
}

const hashMembershipView = 'membershipView'

export function isMembershipView<V>(v: V) {
  return is$typed(v, id, hashMembershipView)
}

export function validateMembershipView<V>(v: V) {
  return validate<MembershipView & V>(v, id, hashMembershipView)
}

/** What kind of group this is. */
export type Purpose =
  | 'com.authorityone.group.defs#community'
  | 'com.authorityone.group.defs#channel'
  | 'com.authorityone.group.defs#private'
  | (string & {})

/** An open-ended community space. */
export const COMMUNITY = `${id}#community`
/** A narrow topical channel. */
export const CHANNEL = `${id}#channel`
/** A private, members-only space. */
export const PRIVATE = `${id}#private`

/** Who can see the group and read its timeline. Orthogonal to admissionPolicy. */
export type Visibility =
  | 'com.authorityone.group.defs#public'
  | 'com.authorityone.group.defs#unlisted'
  | 'com.authorityone.group.defs#visPrivate'
  | (string & {})

/** Indexed and readable by anyone; appears in directory/search. */
export const PUBLIC = `${id}#public`
/** Readable by direct URL but not surfaced in directory/search. */
export const UNLISTED = `${id}#unlisted`
/** Timeline and member list served by the AppView only to effective members. */
export const VISPRIVATE = `${id}#visPrivate`

/** How a user becomes a member. Orthogonal to visibility. */
export type AdmissionPolicy =
  | 'com.authorityone.group.defs#open'
  | 'com.authorityone.group.defs#request'
  | 'com.authorityone.group.defs#inviteOnly'
  | 'com.authorityone.group.defs#closed'
  | (string & {})

/** Anyone may self-join; a membership record is valid on its own. */
export const OPEN = `${id}#open`
/** User requests; an admin must approve (invite record / approvedBy). */
export const REQUEST = `${id}#request`
/** An admin must create an invite record first. */
export const INVITEONLY = `${id}#inviteOnly`
/** No new members; existing memberships honored. */
export const CLOSED = `${id}#closed`

/** Who may associate posts to the group's timeline. */
export type PostingPolicy =
  | 'com.authorityone.group.defs#postMembers'
  | 'com.authorityone.group.defs#postAdmins'
  | 'com.authorityone.group.defs#postAnyone'
  | (string & {})

/** Effective members may post (default). */
export const POSTMEMBERS = `${id}#postMembers`
/** Only moderators/admins/owner may post. */
export const POSTADMINS = `${id}#postAdmins`
/** Anyone who can see the group may post. */
export const POSTANYONE = `${id}#postAnyone`

/** A member's role within a group. */
export type Role =
  | 'com.authorityone.group.defs#member'
  | 'com.authorityone.group.defs#moderator'
  | 'com.authorityone.group.defs#admin'
  | 'com.authorityone.group.defs#owner'
  | (string & {})

/** Ordinary member. */
export const MEMBER = `${id}#member`
/** Can moderate content within the group. */
export const MODERATOR = `${id}#moderator`
/** Can manage members and invites. */
export const ADMIN = `${id}#admin`
/** Full control; the group record host. */
export const OWNER = `${id}#owner`

/** Effective membership status computed by the AppView. */
export type MembershipStatus =
  | 'com.authorityone.group.defs#active'
  | 'com.authorityone.group.defs#pending'
  | 'com.authorityone.group.defs#invited'
  | 'com.authorityone.group.defs#banned'
  | 'com.authorityone.group.defs#left'
  | (string & {})

/** An effective member in good standing. */
export const ACTIVE = `${id}#active`
/** Requested to join; awaiting admin approval. */
export const PENDING = `${id}#pending`
/** Invited by an admin; not yet accepted/active. */
export const INVITED = `${id}#invited`
/** Removed and barred by an admin. */
export const BANNED = `${id}#banned`
/** Voluntarily left. */
export const LEFT = `${id}#left`
