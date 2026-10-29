/**
 * Client-side lexicon validation for a bound community batch.
 *
 * OPEN (Q7, design doc section 2): the bound batch goes to the PDS with
 * validate:false (option (a), the doc's recommended default), so every record
 * in it is validated here before sending.
 *
 * The generated lexicon module (`#/lib/lexicon/generated/lexicons`) imports
 * with `.js` specifiers that do not resolve under jest, so the binding schema
 * is carried here. A test checks it is identical to
 * `lexicons/com/authorityone/group/post.json`.
 */
import {schemas as atprotoSchemas} from '@atproto/api'
import {
  type LexiconDoc,
  Lexicons,
  ValidationError,
  type ValidationResult,
} from '@atproto/lexicon'

import {GROUP_POST_COLLECTION} from '#/lib/communities/groupPostBinding'

export const GROUP_POST_LEXICON = {
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
            ref: 'com.atproto.repo.strongRef',
            description:
              'Strong reference to the app.bsky.feed.post being associated. The post lives in the same repo as this record.',
          },
          group: {
            type: 'ref',
            ref: 'com.atproto.repo.strongRef',
            description:
              'Strong reference to the target com.authorityone.group.profile record.',
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
          },
        },
      },
    },
  },
} as const satisfies LexiconDoc

let lexicons: Lexicons | undefined

export function validateGroupPostRecord(value: unknown): ValidationResult {
  lexicons ??= new Lexicons([
    ...atprotoSchemas.filter(d => d.id === 'com.atproto.repo.strongRef'),
    GROUP_POST_LEXICON,
  ])
  if (
    !value ||
    typeof value !== 'object' ||
    (value as {$type?: unknown}).$type !== GROUP_POST_COLLECTION
  ) {
    return {
      success: false,
      error: new ValidationError(`Must have $type ${GROUP_POST_COLLECTION}`),
    }
  }
  return lexicons.validate(`${GROUP_POST_COLLECTION}#main`, value)
}
