/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  type LexiconDoc,
  Lexicons,
  ValidationError,
  type ValidationResult,
} from '@atproto/lexicon'
import { type $Typed, is$typed, maybe$typed } from './util.js'

export const schemaDict = {
  ComAuthorityoneCommunityConfig: {
    lexicon: 1,
    id: 'com.authorityone.community.config',
    description:
      '["draft": true] DRAFT - shape may change before it is published. Per-community configuration for an Authority One community: access tier, directory listing, header theme, brand, optional agent and moderation routing. Singleton (key: self) in the repo hosting the community\'s com.authorityone.group.profile. Holds public configuration only: members-tier posts have NO lexicon and never touch a repo.',
    defs: {
      main: {
        type: 'record',
        key: 'literal:self',
        record: {
          type: 'object',
          required: ['community', 'tier', 'consentVersion'],
          properties: {
            community: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
              description:
                'Strong reference to the com.authorityone.group.profile this config applies to.',
            },
            tier: {
              type: 'string',
              description: 'Access tier of the community.',
              knownValues: [
                'com.authorityone.community.config#public',
                'com.authorityone.community.config#members',
                'com.authorityone.community.config#paid',
              ],
            },
            listing: {
              type: 'string',
              description:
                'Whether the community appears in the directory. Defaults to listed if absent.',
              knownValues: [
                'com.authorityone.community.config#listed',
                'com.authorityone.community.config#unlisted',
              ],
            },
            theme: {
              type: 'ref',
              ref: 'lex:com.authorityone.community.config#theme',
            },
            brand: {
              type: 'ref',
              ref: 'lex:com.authorityone.community.config#brand',
            },
            agent: {
              type: 'string',
              format: 'did',
              description:
                "DID of the community's agent account, if any. Clients label agent content from this DID plus the runtime is_agent flag, never from a handle suffix.",
            },
            agentSponsor: {
              type: 'string',
              format: 'did',
              description:
                'DID of the account accountable for the agent. Required when agent is set (enforced by the AppView; lexicon cannot express conditional requirements).',
            },
            moderation: {
              type: 'ref',
              ref: 'lex:com.authorityone.community.config#moderation',
            },
            ageNotice: {
              type: 'string',
              maxGraphemes: 300,
              maxLength: 3000,
              description: 'Optional age notice shown before entry.',
            },
            consentVersion: {
              type: 'integer',
              description:
                "Version of the consent wording members agree to. Matches the tenant ledger's wording_version.",
            },
          },
        },
      },
      theme: {
        type: 'object',
        description:
          'Community header theme. Applied to the community header only, never as a whole-app reskin.',
        properties: {
          primary: {
            type: 'string',
            maxLength: 32,
            description: 'Primary color, CSS hex (e.g. #RRGGBB).',
          },
          accent: {
            type: 'string',
            maxLength: 32,
            description: 'Accent color, CSS hex.',
          },
          background: {
            type: 'string',
            maxLength: 32,
            description: 'Background color, CSS hex.',
          },
          logo: {
            type: 'blob',
            accept: ['image/png', 'image/jpeg'],
            maxSize: 1000000,
          },
          icon: {
            type: 'blob',
            accept: ['image/png', 'image/jpeg'],
            maxSize: 1000000,
          },
          wordmark: {
            type: 'string',
            maxGraphemes: 64,
            maxLength: 640,
            description: 'Text wordmark shown in the community header.',
          },
        },
      },
      brand: {
        type: 'object',
        properties: {
          displayName: {
            type: 'string',
            maxGraphemes: 64,
            maxLength: 640,
          },
          legalName: {
            type: 'string',
            maxGraphemes: 128,
            maxLength: 1280,
          },
          supportUrl: {
            type: 'string',
            format: 'uri',
          },
          termsUrl: {
            type: 'string',
            format: 'uri',
          },
          privacyUrl: {
            type: 'string',
            format: 'uri',
          },
        },
      },
      moderation: {
        type: 'object',
        properties: {
          labelers: {
            type: 'array',
            maxLength: 20,
            items: {
              type: 'string',
              format: 'did',
            },
            description: 'DIDs of labeler services applied to this community.',
          },
          reportTo: {
            type: 'string',
            format: 'did',
            description:
              'DID of the moderation service that receives reports for this community.',
          },
          rulesUrl: {
            type: 'string',
            format: 'uri',
          },
        },
      },
      public: {
        type: 'token',
        description: 'Readable by anyone.',
      },
      members: {
        type: 'token',
        description:
          'Readable by effective members only. Members content is served off-protocol and never written to a PDS.',
      },
      paid: {
        type: 'token',
        description: 'Members tier gated by a paid entitlement.',
      },
      listed: {
        type: 'token',
        description: 'Appears in directory/search.',
      },
      unlisted: {
        type: 'token',
        description: 'Reachable by direct link only.',
      },
    },
  },
  ComAuthorityoneGroupBan: {
    lexicon: 1,
    id: 'com.authorityone.group.ban',
    description:
      "Owner-side ban barring an account from a group. Lives in a group admin/owner's repo. The AppView treats a ban as the highest-precedence moderation signal: a banned DID is excluded from the member list and timeline and cannot post, regardless of any membership or invite record. Unban == delete this record.",
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        record: {
          type: 'object',
          required: ['group', 'subject', 'createdAt'],
          properties: {
            group: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
              description:
                'Strong reference to the com.authorityone.group.profile this ban applies to.',
            },
            subject: {
              type: 'string',
              format: 'did',
              description: 'DID of the account being banned.',
            },
            reason: {
              type: 'string',
              maxGraphemes: 300,
              maxLength: 3000,
              description: 'Optional moderator note.',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  ComAuthorityoneGroupDefs: {
    lexicon: 1,
    id: 'com.authorityone.group.defs',
    description:
      'Shared definitions and token enums for Authority One Social groups. See groups-lexicon-design.md.',
    defs: {
      groupViewBasic: {
        type: 'object',
        description:
          'Lightweight hydrated group view, safe to return to non-members.',
        required: ['uri', 'cid', 'name', 'creator'],
        properties: {
          uri: {
            type: 'string',
            format: 'at-uri',
          },
          cid: {
            type: 'string',
            format: 'cid',
          },
          creator: {
            type: 'string',
            format: 'did',
            description:
              'DID of the repo hosting the group record (owner of record).',
          },
          name: {
            type: 'string',
            maxGraphemes: 64,
            maxLength: 640,
          },
          purpose: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#purpose',
          },
          visibility: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#visibility',
          },
          admissionPolicy: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#admissionPolicy',
          },
          avatar: {
            type: 'string',
            format: 'uri',
          },
          memberCount: {
            type: 'integer',
          },
          viewer: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#viewerState',
          },
          indexedAt: {
            type: 'string',
            format: 'datetime',
          },
        },
      },
      groupView: {
        type: 'object',
        description: 'Full hydrated group view returned by getGroup.',
        required: ['uri', 'cid', 'name', 'creator', 'indexedAt'],
        properties: {
          uri: {
            type: 'string',
            format: 'at-uri',
          },
          cid: {
            type: 'string',
            format: 'cid',
          },
          creator: {
            type: 'string',
            format: 'did',
            description:
              'DID of the repo hosting the group record (owner of record).',
          },
          name: {
            type: 'string',
            maxGraphemes: 64,
            maxLength: 640,
          },
          purpose: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#purpose',
          },
          description: {
            type: 'string',
            maxGraphemes: 3000,
            maxLength: 30000,
          },
          descriptionFacets: {
            type: 'array',
            items: {
              type: 'ref',
              ref: 'lex:app.bsky.richtext.facet',
            },
          },
          visibility: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#visibility',
          },
          admissionPolicy: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#admissionPolicy',
          },
          postingPolicy: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#postingPolicy',
          },
          avatar: {
            type: 'string',
            format: 'uri',
          },
          banner: {
            type: 'string',
            format: 'uri',
          },
          memberCount: {
            type: 'integer',
          },
          viewer: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#viewerState',
          },
          indexedAt: {
            type: 'string',
            format: 'datetime',
          },
        },
      },
      viewerState: {
        type: 'object',
        description:
          'Group-relative state for the requesting viewer, computed by the AppView from effective membership.',
        properties: {
          membership: {
            type: 'string',
            format: 'at-uri',
            description: "URI of the viewer's own membership record, if any.",
          },
          role: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#role',
          },
          status: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#membershipStatus',
          },
          canPost: {
            type: 'boolean',
          },
          canJoin: {
            type: 'boolean',
          },
        },
      },
      memberView: {
        type: 'object',
        description:
          'A member of a group as resolved by the AppView (effective role/status).',
        required: ['subject', 'role', 'status'],
        properties: {
          subject: {
            type: 'ref',
            ref: 'lex:app.bsky.actor.defs#profileView',
          },
          membership: {
            type: 'string',
            format: 'at-uri',
            description: "URI of the member's membership record.",
          },
          role: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#role',
          },
          status: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#membershipStatus',
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
          },
        },
      },
      membershipView: {
        type: 'object',
        description:
          'One group the actor is an effective member of, with their resolved role and status. Returned by getMemberships.',
        required: ['group', 'role', 'status'],
        properties: {
          group: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#groupViewBasic',
          },
          role: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#role',
          },
          status: {
            type: 'ref',
            ref: 'lex:com.authorityone.group.defs#membershipStatus',
          },
        },
      },
      purpose: {
        type: 'string',
        description: 'What kind of group this is.',
        knownValues: [
          'com.authorityone.group.defs#community',
          'com.authorityone.group.defs#channel',
          'com.authorityone.group.defs#private',
        ],
      },
      community: {
        type: 'token',
        description: 'An open-ended community space.',
      },
      channel: {
        type: 'token',
        description: 'A narrow topical channel.',
      },
      private: {
        type: 'token',
        description: 'A private, members-only space.',
      },
      visibility: {
        type: 'string',
        description:
          'Who can see the group and read its timeline. Orthogonal to admissionPolicy.',
        knownValues: [
          'com.authorityone.group.defs#public',
          'com.authorityone.group.defs#unlisted',
          'com.authorityone.group.defs#visPrivate',
        ],
      },
      public: {
        type: 'token',
        description:
          'Indexed and readable by anyone; appears in directory/search.',
      },
      unlisted: {
        type: 'token',
        description:
          'Readable by direct URL but not surfaced in directory/search.',
      },
      visPrivate: {
        type: 'token',
        description:
          'Timeline and member list served by the AppView only to effective members.',
      },
      admissionPolicy: {
        type: 'string',
        description: 'How a user becomes a member. Orthogonal to visibility.',
        knownValues: [
          'com.authorityone.group.defs#open',
          'com.authorityone.group.defs#request',
          'com.authorityone.group.defs#inviteOnly',
          'com.authorityone.group.defs#closed',
        ],
      },
      open: {
        type: 'token',
        description:
          'Anyone may self-join; a membership record is valid on its own.',
      },
      request: {
        type: 'token',
        description:
          'User requests; an admin must approve (invite record / approvedBy).',
      },
      inviteOnly: {
        type: 'token',
        description: 'An admin must create an invite record first.',
      },
      closed: {
        type: 'token',
        description: 'No new members; existing memberships honored.',
      },
      postingPolicy: {
        type: 'string',
        description: "Who may associate posts to the group's timeline.",
        knownValues: [
          'com.authorityone.group.defs#postMembers',
          'com.authorityone.group.defs#postAdmins',
          'com.authorityone.group.defs#postAnyone',
        ],
      },
      postMembers: {
        type: 'token',
        description: 'Effective members may post (default).',
      },
      postAdmins: {
        type: 'token',
        description: 'Only moderators/admins/owner may post.',
      },
      postAnyone: {
        type: 'token',
        description: 'Anyone who can see the group may post.',
      },
      role: {
        type: 'string',
        description: "A member's role within a group.",
        knownValues: [
          'com.authorityone.group.defs#member',
          'com.authorityone.group.defs#moderator',
          'com.authorityone.group.defs#admin',
          'com.authorityone.group.defs#owner',
        ],
      },
      member: {
        type: 'token',
        description: 'Ordinary member.',
      },
      moderator: {
        type: 'token',
        description: 'Can moderate content within the group.',
      },
      admin: {
        type: 'token',
        description: 'Can manage members and invites.',
      },
      owner: {
        type: 'token',
        description: 'Full control; the group record host.',
      },
      membershipStatus: {
        type: 'string',
        description: 'Effective membership status computed by the AppView.',
        knownValues: [
          'com.authorityone.group.defs#active',
          'com.authorityone.group.defs#pending',
          'com.authorityone.group.defs#invited',
          'com.authorityone.group.defs#banned',
          'com.authorityone.group.defs#left',
        ],
      },
      active: {
        type: 'token',
        description: 'An effective member in good standing.',
      },
      pending: {
        type: 'token',
        description: 'Requested to join; awaiting admin approval.',
      },
      invited: {
        type: 'token',
        description: 'Invited by an admin; not yet accepted/active.',
      },
      banned: {
        type: 'token',
        description: 'Removed and barred by an admin.',
      },
      left: {
        type: 'token',
        description: 'Voluntarily left.',
      },
    },
  },
  ComAuthorityoneGroupGetGroup: {
    lexicon: 1,
    id: 'com.authorityone.group.getGroup',
    description:
      "Get a hydrated view of a single group, including the requesting viewer's effective membership state. Served by the Authority One AppView indexer (NOT the bare PDS).",
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['group'],
          properties: {
            group: {
              type: 'string',
              format: 'at-uri',
              description:
                'at:// URI of the com.authorityone.group.profile record.',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['group'],
            properties: {
              group: {
                type: 'ref',
                ref: 'lex:com.authorityone.group.defs#groupView',
              },
            },
          },
        },
        errors: [
          {
            name: 'GroupNotFound',
          },
          {
            name: 'NotAuthorized',
            description:
              'Group is private and the viewer is not an effective member.',
          },
        ],
      },
    },
  },
  ComAuthorityoneGroupGetMembers: {
    lexicon: 1,
    id: 'com.authorityone.group.getMembers',
    description:
      'List the effective members of a group with resolved roles and statuses. Served by the Authority One AppView indexer.',
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['group'],
          properties: {
            group: {
              type: 'string',
              format: 'at-uri',
            },
            status: {
              type: 'string',
              description:
                'Optional filter to a single membership status (defaults to active).',
              knownValues: [
                'com.authorityone.group.defs#active',
                'com.authorityone.group.defs#pending',
                'com.authorityone.group.defs#invited',
                'com.authorityone.group.defs#banned',
              ],
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
            },
            cursor: {
              type: 'string',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['group', 'members'],
            properties: {
              cursor: {
                type: 'string',
              },
              group: {
                type: 'ref',
                ref: 'lex:com.authorityone.group.defs#groupViewBasic',
              },
              members: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'lex:com.authorityone.group.defs#memberView',
                },
              },
            },
          },
        },
        errors: [
          {
            name: 'GroupNotFound',
          },
          {
            name: 'NotAuthorized',
          },
        ],
      },
    },
  },
  ComAuthorityoneGroupGetMemberships: {
    lexicon: 1,
    id: 'com.authorityone.group.getMemberships',
    description:
      "List the groups a given actor is an effective member of. Powers the 'My Groups' surface. Served by the Authority One AppView indexer.",
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['actor'],
          properties: {
            actor: {
              type: 'string',
              format: 'at-identifier',
              description: 'DID or handle of the actor.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
            },
            cursor: {
              type: 'string',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['memberships'],
            properties: {
              cursor: {
                type: 'string',
              },
              memberships: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'lex:com.authorityone.group.defs#membershipView',
                },
              },
            },
          },
        },
      },
    },
  },
  ComAuthorityoneGroupGetTimeline: {
    lexicon: 1,
    id: 'com.authorityone.group.getTimeline',
    description:
      'Get the group-scoped post timeline: app.bsky.feed.post views for posts associated to the group via com.authorityone.group.post, with visibility and posting-policy gating applied. Served by the Authority One AppView indexer.',
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['group'],
          properties: {
            group: {
              type: 'string',
              format: 'at-uri',
              description: 'at:// URI of the group profile record.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
            },
            cursor: {
              type: 'string',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['feed'],
            properties: {
              cursor: {
                type: 'string',
              },
              feed: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'lex:app.bsky.feed.defs#feedViewPost',
                },
              },
            },
          },
        },
        errors: [
          {
            name: 'GroupNotFound',
          },
          {
            name: 'NotAuthorized',
            description:
              'Group is private and the viewer is not an effective member.',
          },
        ],
      },
    },
  },
  ComAuthorityoneGroupInvite: {
    lexicon: 1,
    id: 'com.authorityone.group.invite',
    description:
      "Owner-side admission grant for request/inviteOnly groups. Lives in a group admin/owner's repo. The corroborating record a member's com.authorityone.group.membership is validated against by the AppView. Revoke == delete this record.",
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        record: {
          type: 'object',
          required: ['group', 'invitee', 'createdAt'],
          properties: {
            group: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
              description:
                'Strong reference to the com.authorityone.group.profile this invite grants access to.',
            },
            invitee: {
              type: 'string',
              format: 'did',
              description: 'DID of the account being granted membership.',
            },
            role: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#role',
              description: 'Role granted. Defaults to member.',
            },
            expiresAt: {
              type: 'string',
              format: 'datetime',
              description:
                'Optional expiry; after this the invite is no longer corroborating.',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  ComAuthorityoneGroupMembership: {
    lexicon: 1,
    id: 'com.authorityone.group.membership',
    description:
      "A member's self-asserted tie to a group. Lives in the MEMBER's own repo (so it rides their CAR export and leaving == deleting it). Not authoritative alone: the AppView resolves effective membership by joining this against the group's admissionPolicy and owner-side invite/approval. Mirrors app.bsky.graph.listitem, inverted to the member.",
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        record: {
          type: 'object',
          required: ['subject', 'createdAt'],
          properties: {
            subject: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
              description:
                'Strong reference to the com.authorityone.group.profile record being joined.',
            },
            role: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#role',
              description:
                'Self-asserted role. Defaults to member. Elevated roles are only effective if corroborated by an owner-side invite/approval (the AppView will not honor a self-claimed admin).',
            },
            status: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#membershipStatus',
              description:
                'Self-asserted status (e.g. active for open groups, pending for request groups, left to depart while retaining a record). The AppView may downgrade this to its effective value.',
            },
            invitedBy: {
              type: 'string',
              format: 'did',
              description:
                'DID of the admin whose invite this membership claims to redeem (for invite/request groups). Audit aid; the AppView validates against the actual invite record.',
            },
            approvedBy: {
              type: 'string',
              format: 'did',
              description:
                'DID of the admin who approved a request, if recorded client-side. Audit aid only.',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
              description:
                'When the member created this record (joined-at for active memberships).',
            },
          },
        },
      },
    },
  },
  ComAuthorityoneGroupPost: {
    lexicon: 1,
    id: 'com.authorityone.group.post',
    description:
      "Association of an ordinary app.bsky.feed.post to a group's timeline. Lives in the AUTHOR's repo. Keeps the underlying post a standard post (threads/embeds/likes/moderation work unchanged); the group binding is layered metadata. Mirrors app.bsky.graph.listitem, but the subject is a post rather than an actor.",
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        record: {
          type: 'object',
          required: ['subject', 'group', 'createdAt'],
          properties: {
            subject: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
              description:
                'Strong reference to the app.bsky.feed.post being associated. The post lives in the same repo as this record.',
            },
            group: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.post#groupRef',
              description:
                'The target com.authorityone.group.profile record. OPEN (Q1): option (a), the default, names the group by AT-URI only (no cid), since a pinned cid dangles after every owner edit of the profile; option (b) also pins the profile cid at posting time. Bindings written as a strongRef ({uri, cid}) stay valid.',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
            },
          },
        },
      },
      groupRef: {
        type: 'object',
        required: ['uri'],
        properties: {
          uri: {
            type: 'string',
            format: 'at-uri',
          },
          cid: {
            type: 'string',
            format: 'cid',
          },
        },
      },
    },
  },
  ComAuthorityoneGroupProfile: {
    lexicon: 1,
    id: 'com.authorityone.group.profile',
    description:
      "Record declaring a group on Authority One Social. The at:// URI of this record is the group's canonical identity. Mirrors app.bsky.graph.list. Lives in the owner's repo.",
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        record: {
          type: 'object',
          required: ['name', 'createdAt'],
          properties: {
            name: {
              type: 'string',
              maxGraphemes: 64,
              maxLength: 640,
              description: 'Display name of the group.',
            },
            purpose: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#purpose',
            },
            description: {
              type: 'string',
              maxGraphemes: 3000,
              maxLength: 30000,
            },
            descriptionFacets: {
              type: 'array',
              items: {
                type: 'ref',
                ref: 'lex:app.bsky.richtext.facet',
              },
            },
            visibility: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#visibility',
              description:
                'Defaults to public if absent. Who can see/read the group.',
            },
            admissionPolicy: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#admissionPolicy',
              description:
                'Defaults to open if absent. How a user becomes a member.',
            },
            postingPolicy: {
              type: 'ref',
              ref: 'lex:com.authorityone.group.defs#postingPolicy',
              description:
                'Defaults to members if absent. Who may post to the timeline.',
            },
            avatar: {
              type: 'blob',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 1000000,
            },
            banner: {
              type: 'blob',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 1000000,
            },
            createdBy: {
              type: 'string',
              format: 'did',
              description:
                'DID of the human/agent who created the group. Usually equals the hosting repo DID; recorded explicitly for org-hosted groups.',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  ComAuthorityoneGroupSearchGroups: {
    lexicon: 1,
    id: 'com.authorityone.group.searchGroups',
    description:
      "List or search the group directory. Served by the Authority One AppView indexer. Only public groups are surfaced to anonymous/non-member requesters; unlisted and private groups appear only to an effective member (so membership-scoped 'my groups' search works). Reverse-chronological, cursor-paginated.",
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          properties: {
            q: {
              type: 'string',
              description:
                'Optional case-insensitive substring match over the group name. Omit to list the directory.',
            },
            member: {
              type: 'string',
              format: 'did',
              description:
                'Optional filter: only groups this DID is an effective member of.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
            },
            cursor: {
              type: 'string',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['groups'],
            properties: {
              cursor: {
                type: 'string',
              },
              groups: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'lex:com.authorityone.group.defs#groupViewBasic',
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Record<string, LexiconDoc>
export const schemas = Object.values(schemaDict) satisfies LexiconDoc[]
export const lexicons: Lexicons = new Lexicons(schemas)

export function validate<T extends { $type: string }>(
  v: unknown,
  id: string,
  hash: string,
  requiredType: true,
): ValidationResult<T>
export function validate<T extends { $type?: string }>(
  v: unknown,
  id: string,
  hash: string,
  requiredType?: false,
): ValidationResult<T>
export function validate(
  v: unknown,
  id: string,
  hash: string,
  requiredType?: boolean,
): ValidationResult {
  return (requiredType ? is$typed : maybe$typed)(v, id, hash)
    ? lexicons.validate(`${id}#${hash}`, v)
    : {
        success: false,
        error: new ValidationError(
          `Must be an object with "${hash === 'main' ? id : `${id}#${hash}`}" $type property`,
        ),
      }
}

export const ids = {
  ComAuthorityoneCommunityConfig: 'com.authorityone.community.config',
  ComAuthorityoneGroupBan: 'com.authorityone.group.ban',
  ComAuthorityoneGroupDefs: 'com.authorityone.group.defs',
  ComAuthorityoneGroupGetGroup: 'com.authorityone.group.getGroup',
  ComAuthorityoneGroupGetMembers: 'com.authorityone.group.getMembers',
  ComAuthorityoneGroupGetMemberships: 'com.authorityone.group.getMemberships',
  ComAuthorityoneGroupGetTimeline: 'com.authorityone.group.getTimeline',
  ComAuthorityoneGroupInvite: 'com.authorityone.group.invite',
  ComAuthorityoneGroupMembership: 'com.authorityone.group.membership',
  ComAuthorityoneGroupPost: 'com.authorityone.group.post',
  ComAuthorityoneGroupProfile: 'com.authorityone.group.profile',
  ComAuthorityoneGroupSearchGroups: 'com.authorityone.group.searchGroups',
} as const
