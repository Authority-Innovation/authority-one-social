# Design: public-tier community posts carry a `com.authorityone.group.post` binding

Status: DESIGN ONLY. Nothing here is built. No code, no lexicon changes.
Base: `communities/integration` at `1201076cc`.

## Where we are today

- `apilib.post` (`src/lib/api/index.ts`) builds every post in a thread as an
  `applyWrites#create` and sends one `com.atproto.repo.applyWrites` call. It
  already computes each post's CID locally (`computeCid`) so later posts in a
  thread can reply to earlier ones.
- `resolveTarget` (`src/lib/communities/resolveTarget.ts`) refuses every
  public-tier community target with `public-community-not-available`, because
  the only PDS path writes a plain `app.bsky.feed.post` and the community would
  be lost (it would just be a profile post).
- `usePostToGroupMutation` (`src/state/queries/group.ts`) writes a
  `com.authorityone.group.post` with its own `createRecord`, after the post
  exists. It is not wired in (`TODO(composer)`).
- The lexicon `lexicons/com/authorityone/group/post.json` already exists:
  `subject` (strongRef to the post), `group` (strongRef to the
  `com.authorityone.group.profile`), `createdAt`. Record key `tid`.
- A composer target is `{kind: 'community', id, tier}`. For public tier the
  `id` is the runtime community id (e.g. `btb`); the group AT-URI is only on
  the community descriptor (`groupUri`, optional, `src/screens/Community/descriptor.ts`).
  Nothing in the target carries a group CID.
- Members and paid targets are refused for PDS writes by
  `guardComposerPdsWrite` and go only through `communitiesClient`.

## 1. Record shape

Keep the existing lexicon unchanged:

```
com.authorityone.group.post (record, key: tid)
  subject:   strongRef  { uri: at://<author>/app.bsky.feed.post/<rkey>, cid }
  group:     strongRef  { uri: at://<owner>/com.authorityone.group.profile/<rkey>, cid }
  createdAt: datetime
```

- `subject.uri` / `subject.cid`: the post being bound. Same repo as the
  binding. Both are known before any network write: the rkey is the TID
  `apilib.post` generates, and the CID comes from `computeCid(record)`.
- `group.uri`: the group profile record. Source: the community descriptor's
  `groupUri`. A public community with no `groupUri` cannot be posted to
  (refused, see 2).
- `group.cid`: the CID of the group profile at the time of posting. The
  composer target does not carry it, and should not (it goes stale when the
  owner edits the profile). It is fetched at submit time from the group
  AppView (`com.authorityone.group.getGroup`, whose `GroupView` already carries
  `cid`, as `useJoinGroupMutation` relies on). Fallback is not allowed: if the
  fetch fails or returns no CID, the submit fails before any write.

Binding rkey: use the same TID as the post. One post has at most one binding,
the pair is easy to find from either side, and a retry cannot create a second
binding for the same post (the create collides instead).

The composer target type grows a resolved form that is only built at submit
time, never stored: `{kind: 'community', id, tier: 'public', group: {uri, cid}}`.

## 2. How a public community post binds: one write

One `applyWrites` call, containing, per post in the thread:

1. `app.bsky.feed.post` create (as today),
2. threadgate / postgate creates (as today, first post only),
3. `com.authorityone.group.post` create, rkey = post rkey,
   `subject = {uri, cid}` from step 1, `group = {uri, cid}` from 1 above.

`applyWrites` is applied as one repo commit: all writes land or none do. So a
public community post can never exist without its binding, and a binding can
never exist without its post. This replaces the two-step
create-then-`usePostToGroupMutation` flow, which would leave an unbound post
(a profile post) whenever the second call failed.

`usePostToGroupMutation` stays for a later "add an existing post to a
community" action (if we want one, see open questions), not for the composer.

Validation: `applyWrites` takes one `validate` flag for the whole batch. The
PDS does not know `com.authorityone.group.*`, so `validate: true` would reject
the batch. For a community submit, pass `validate` unset (the PDS validates
the records whose lexicon it knows, i.e. the `app.bsky.feed.post`, and accepts
the binding unvalidated). Video posts keep `validate: false` as today. The
client validates the binding against our generated lexicon before sending.

Failure behaviour, all fail closed:

| Failure | Result |
| --- | --- |
| Flag off | Refused in `resolveTarget` (`communities-disabled`). No write. |
| Descriptor has no `groupUri` | Refused (`public-community-not-available`). No write. |
| `getGroup` fails / no CID / group not found | Refused before `applyWrites`. Nothing sent. Error toast, draft kept. |
| `applyWrites` fails (network, PDS rejects) | Nothing committed (atomic). Same error path as today; draft kept. |
| Viewer not allowed to post (posting policy) | AppView would not index it. Pre-check via `GroupView.viewer` before the write; refuse if not an active member where the policy needs one. |
| `applyWrites` succeeds, AppView slow to index | Post and binding exist. Community timeline catches up; no client action. |

There is no path that falls back to a plain profile post. If any step before
the commit fails, nothing is written.

Threads: every post in a multi-post thread gets its own binding in the same
batch, all to the same group.

## 3. Threads and replies

- A reply inherits its parent's target (already the rule in `resolveTarget`).
  A reply to a public community post binds to the same community: same
  `group` strongRef, own binding record, written in the same `applyWrites` as
  the reply.
- The reply's `reply.root` / `reply.parent` are the normal atproto refs. The
  binding is per post; the root's binding is not referenced.
- `replyTo.target` must be correct for community posts. Today
  `feedPostTarget` (e0a04a1b) maps every AppView `app.bsky.feed.post` URI to
  `{kind: 'profile'}`, which is only true because no bound public posts exist.
  Once they do, that assumption breaks. Change:
  - Items from a community source (`getTimeline`, carrying `ReasonCommunity`)
    set their target to `{kind: 'community', id, tier: 'public'}` from the
    source, not through `feedPostTarget`.
  - Posts from elsewhere (Following, threads, the video feed) need their
    binding from the AppView: the group AppView adds the binding to the post
    view (shape is an open question). `feedPostTarget` returns the community
    target when a binding is present, `{kind: 'profile'}` only when the
    AppView positively says "no binding", and `undefined` otherwise, which
    `resolveTarget` refuses as `unknown-parent-target`.
- An explicit target that disagrees with the parent's (e.g. replying to a
  profile post "into" a community) stays `reply-target-mismatch`.
- Replies from people who are not members of the community: same posting
  policy check as top-level posts (open question on whether non-members may
  reply).

## 4. Resolver once binding exists

`resolveTarget` changes in exactly one place: `ok()` stops refusing
`{kind: 'community', tier: 'public'}` and returns
`{ok: true, target, route: 'pds-community', locked}`.

- New route `'pds-community'`, distinct from `'pds'`. The composer's publish
  step switches on route: `'pds'` calls `apilib.post` with no binding;
  `'pds-community'` calls `apilib.post` with a required `group` strongRef and
  throws if it is missing. `'communities'` is unchanged.
- Everything else stays: flag off refuses community targets, the lock rules,
  the reply inheritance, the unknown-parent refusal.
- `apilib.post` gets a `binding?: {group: StrongRef}` option. With a public
  community target and no binding, it throws before building any write.

The tests that prove a public target never becomes a profile post:

1. `resolveTarget` table: public target (explicit, inherited, locked) with the
   flag on resolves to route `'pds-community'`, never `'pds'`.
2. `apilib.post` with mocked `applyWrites`: for a public community submit, the
   single call's `writes` contains, for every `app.bsky.feed.post` create, a
   `com.authorityone.group.post` create with the same rkey,
   `subject.uri` equal to that post's URI, `subject.cid` equal to its computed
   CID, and `group` equal to the resolved group. Assert there is exactly one
   `applyWrites` call and no `createRecord` call.
3. Group CID fetch fails: assert `applyWrites` is never called.
4. Route `'pds-community'` with no group ref: `apilib.post` throws and
   `applyWrites` is never called.
5. Composer-level: public community target end-to-end with the publish
   mocked; the only PDS write is the batched one from test 2.

## 5. Flags

The whole path stays behind `EXPO_PUBLIC_COMMUNITIES_ENABLED`, default
`"false"` in every `eas.json` profile (base, development, preview,
production, production-apk, testflight, testflight-android are all `"false"`
at `1201076cc`, and stay so). With the flag off, `resolveTarget` refuses every
community target before the new route is reachable, so profile posting is
byte-identical to today. No new flag is proposed.

## 6. Members and paid: unchanged

Rule: members-tier and paid-tier content never reaches a PDS. No
`createRecord`, `putRecord`, `applyWrites`, `uploadBlob`, draft write, or bsky
video upload, and no `com.authorityone.group.post` binding either (a binding
on the PDS would itself leak that the post exists and where). They go only
through `communitiesClient`, and `guardComposerPdsWrite` keeps refusing them.
This design does not touch that path.

What would have to be true to change it (out of scope): an encrypted or
access-controlled record type on the PDS that the network cannot read, a
decision that the existence and metadata of a members post may be public, and
a migration story for content already in the walled store. None of that is
proposed.

## 7. Open questions for Elliott

1. Is the group CID strongRef worth it, or should `group` be a plain AT-URI so
   the client does not need a `getGroup` call at submit time? (Changes the
   existing lexicon.)
2. Should the binding rkey equal the post rkey (one binding per post,
   idempotent), or stay a free TID (allows a post in several communities)?
3. Can one public post belong to more than one community?
4. Can a non-member reply into a public community thread, and is the reply
   bound to the community or left as a profile reply?
5. How should the AppView expose a post's binding in ordinary post views
   (Following, threads), so `feedPostTarget` can stop assuming "profile"?
6. Deleting a post: should the client delete the binding in the same
   `applyWrites`, and what does the AppView do with an orphaned binding?
7. Is skipping strict validation on community submits (`validate` unset)
   acceptable, or do we need the PDS to load our lexicons?
8. Should a bound public post also appear on the author's profile feed, or be
   filtered from it by the AppView?
9. Is "add an existing post to a community" (the old two-step mutation) a
   feature we want, or should `usePostToGroupMutation` be removed?
10. Posting policy: is the pre-check against `GroupView.viewer` enough, or must
    the AppView also refuse to index bindings from non-members?
