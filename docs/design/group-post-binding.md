# Design: public-tier community posts carry a `com.authorityone.group.post` binding

Status: DESIGN ONLY. Nothing here is built. No code, no lexicon changes.
Bases (two, not the same):
- PR base: `f6448b0a5` (revision 1 of this doc, the commit this PR builds on).
- Integration base: `communities/integration` at `1201076cc`, the earlier
  code state that revision 1 was written against. Code references and line
  numbers in this doc are as of `1201076cc`.

Revision 2: review fixes (review verdict SOUND WITH CHANGES). Items that need
a decision by Elliott are marked **OPEN** and collected in section 8.

## Where we are today

- `apilib.post` (`src/lib/api/index.ts`) builds every post in a thread as an
  `applyWrites#create` and sends one `com.atproto.repo.applyWrites` call. It
  already computes each post's CID locally (`computeCid`) so later posts in a
  thread can reply to earlier ones. It passes `validate` explicitly:
  `validate: opts.videoEmbed ? false : true` (`src/lib/api/index.ts:197`).
- `resolveTarget` (`src/lib/communities/resolveTarget.ts`) refuses every
  public-tier community target with `public-community-not-available`, because
  the only PDS path writes a plain `app.bsky.feed.post` and the community would
  be lost (it would just be a profile post).
- `guardComposerPdsWrite` (`src/lib/communities/composerTarget.ts:72`) already
  returns `{allowed: true}` for `{kind: 'community', tier: 'public'}`, with no
  flag check. It is the gate for drafts
  (`src/view/com/composer/drafts/state/queries.ts`), blob upload
  (`src/view/com/composer/Composer.tsx`), video
  (`src/view/com/composer/state/video.ts`), the drafts dialog, and
  `submitComposerThread` (`src/view/com/composer/state/submit.ts:69`), which
  on `allowed` calls
  `apilib.post` with no binding.
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

Current lexicon:

```
com.authorityone.group.post (record, key: tid)
  subject:   strongRef  { uri: at://<author>/app.bsky.feed.post/<rkey>, cid }
  group:     strongRef  { uri: at://<owner>/com.authorityone.group.profile/<rkey>, cid }
  createdAt: datetime
```

- `subject.uri` / `subject.cid`: the post being bound. Same repo as the
  binding. Both are known before any network write: the rkey is the TID
  `apilib.post` generates, and the CID comes from `computeCid(record)`. The
  computed CID must equal the CID the PDS stores; see "CID check" in 2.
- `group.uri`: the group profile record. Source: the community descriptor's
  `groupUri`. A public community with no `groupUri` cannot be posted to
  (refused, see 2).
- `group.cid`: see the OPEN item below.

### group.cid: pinned CID dangles on every owner edit (OPEN)

The group profile lives in the **owner's** repo; the binding lives in the
**author's** repo. Any edit the owner makes to the group profile (name,
avatar, description, policy) produces a new CID. Every binding written before
that edit then pins a CID that no longer resolves to the current record, and
nothing in the author's repo can update it (the author would have to rewrite
every binding). With the current lexicon, after the first owner edit every
existing binding points at a superseded version of the group.

Options:

- **(a) Plain AT-URI for `group`, no CID pinned.** Lexicon change:
  `group: at-uri` (format `at-uri`) instead of `strongRef`. The binding names
  the group, not a version of it. No `getGroup` call is needed at submit time
  (removes a failure row from 2). The AppView joins on the URI.
- **(b) Keep the strongRef, define a resolution rule for superseded CIDs.**
  The AppView must treat `group.cid` as "the version at posting time" and
  resolve any binding whose `group.uri` matches the current group regardless
  of CID. The CID then carries no enforced meaning, while still costing a
  `getGroup` fetch at submit time and a fail-closed refusal when it fails.
  Requires the rule to be written into the AppView indexer and documented in
  the lexicon description.

**Recommendation: (a)**, unless a reason to pin the group version is given
(none is known: the posting policy is checked at index time against the
current group, not the pinned one). Decision: **OPEN (Q1)**.

The rest of this doc is written so it holds under either option. Where it
says "resolved group", that is `{uri}` under (a) and `{uri, cid}` under (b).
Under (b) only: `group.cid` is fetched at submit time from the group AppView
(`com.authorityone.group.getGroup`, whose `GroupView` carries `cid`, as
`useJoinGroupMutation` relies on). No fallback: if the fetch fails or returns
no CID, the submit fails before any write.

Binding rkey: use the same TID as the post. One post has at most one binding,
the pair is easy to find from either side, and a retry cannot create a second
binding for the same post (the create collides instead). (Q2 asks whether to
keep this.)

The composer target type grows a resolved form that is only built at submit
time, never stored: `{kind: 'community', id, tier: 'public', group}` with
`group` the resolved group.

## 2. How a public community post binds: one write

One `applyWrites` call, containing, per post in the thread:

1. `app.bsky.feed.post` create (as today),
2. threadgate / postgate creates (as today, first post only),
3. `com.authorityone.group.post` create, rkey = post rkey,
   `subject = {uri, cid}` from step 1, `group` = the resolved group.

`applyWrites` is applied as one repo commit: all writes land or none do. So a
public community post can never exist without its binding, and a binding can
never exist without its post. This replaces the two-step
create-then-`usePostToGroupMutation` flow, which would leave an unbound post
(a profile post) whenever the second call failed.

`usePostToGroupMutation` stays for a later "add an existing post to a
community" action (if we want one, see Q9), not for the composer.

### CID check (required)

The atomic-batch claim holds, but `subject.cid` is computed locally before
the write. It is only correct if `computeCid(record)` produces exactly the
CID of the DAG-CBOR the PDS stores. If they differ, the binding pins a CID
that does not match its post. Required:

- After `applyWrites` returns, for every post in the batch, compare the
  locally computed CID with `results[i].cid` of the matching
  `app.bsky.feed.post` create. If any differ, the post **fails**: surface the
  error, log it, and do not report success. (The batch is already committed,
  so "fail" means the client treats it as an error and the mismatch is
  logged; whether to also issue a compensating delete of the batch is part of
  the delete decision, D3.) D3 is **OPEN (Q6)**. Until Q6 is decided, this
  client-side failure has **no compensating action**: the post and its
  binding stay committed on the PDS with the mismatched CID, and the only
  effects are the surfaced error and the log entry.
- A test asserts the same, see test 6 in 4.

### Validation (unverified, OPEN)

`applyWrites` takes one `validate` flag for the whole batch. An unset
`validate` means **default validation**, not "off": the review found the
default treated as `true`, while the lexicon text describes unset as
"validate only known lexicons". Which of these our PDS actually does for an
unknown collection has not been tested. Either way, unsetting it does not turn
validation off. And `apilib.post` does not leave it unset: it passes
`validate: true` explicitly for every non-video post
(`src/lib/api/index.ts:197`), so "pass `validate` unset" would itself be a
code change.

The claim in revision 1 that "the PDS accepts the binding unvalidated under
default validation" is **unverified**. It has not been tested against our PDS
version. The expected behaviour under `validate: true` (today's value for
non-video posts) is that a record in an unknown lexicon is rejected and the
whole batch fails. This is also **unverified**: it is the documented
behaviour, not something tested against our PDS version.

One of these changes is required before this design can work:

- **(a) `validate: false` for the community batch.** `apilib.post` passes
  `validate: false` whenever the batch contains a binding. Consequence: the
  `app.bsky.feed.post` records in that batch are also not validated by the
  PDS. Mitigation: the client validates every record in the batch (posts and
  bindings) against the generated lexicons before sending, and refuses to
  send on failure. Video posts already take this path today.
- **(b) Load `com.authorityone.group.*` lexicons on the PDS.** The batch keeps
  `validate: true` and the PDS validates the binding too. Requires a PDS-side
  change (out of this repo) and keeping the PDS lexicons in step with ours.

Recommendation: (a) with mandatory client-side validation, because it needs no
PDS change and matches the existing video path; revisit (b) if we run our own
PDS. Either way, verify against the real PDS before building: a batch with a
binding under the chosen `validate` value is accepted. Decision: **OPEN (Q7)**.

### Failure behaviour, all fail closed

| Failure | Result |
| --- | --- |
| Flag off | Refused in `resolveTarget` (`communities-disabled`). No post write. (Drafts / blobs / video: see 5, the guard does not check the flag today.) |
| Descriptor has no `groupUri` | Refused (`public-community-not-available`). No write. |
| `getGroup` fails / no CID / group not found (option (b) of Q1 only) | Refused before `applyWrites`. Nothing sent. Error toast, draft kept. |
| Client-side lexicon validation fails | Refused before `applyWrites`. Nothing sent. |
| `applyWrites` fails (network, PDS rejects) | Nothing committed (atomic). Same error path as today; draft kept. |
| Computed CID differs from `results[].cid` | Post reported as failed and logged (see CID check). |
| Viewer not allowed to post (posting policy) | **Client pre-check only**: refuse via `GroupView.viewer` before the write when the policy needs an active member. This is a UX check, not enforcement: a non-member can write a binding straight to their own PDS with any client. **The AppView must enforce membership**: it does not index (or drops) bindings whose author is not allowed to post under the group's policy at index time. |
| `applyWrites` succeeds, AppView slow to index | Post and binding exist. Community timeline catches up; no client action. |

There is no path that falls back to a plain profile post. If any step before
the commit fails, nothing is written.

Threads: every post in a multi-post thread gets its own binding in the same
batch, all to the same group.

## 3. Threads, replies, edits, deletes

Each of these is an explicit decision (D) or an explicit OPEN item.

### D1. Replies bind (decision)

- A reply inherits its parent's target (already the rule in `resolveTarget`).
  A reply to a public community post binds to the same community: same
  `group`, own binding record, written in the same `applyWrites` as the
  reply.
- The reply's `reply.root` / `reply.parent` are the normal atproto refs. The
  binding is per post; the root's binding is not referenced.
- An explicit target that disagrees with the parent's (e.g. replying to a
  profile post "into" a community) stays `reply-target-mismatch`.
- `replyTo.target` must be correct for community posts. Today
  `feedPostTarget` (`src/lib/communities/feedPostTarget.ts`, added in
  commit `bcb50086ff99ab03513a1bda543409e71bb12ae4`; `e0a04a1b` is the
  coord task id, not a commit) maps every AppView `app.bsky.feed.post` URI to
  `{kind: 'profile'}`, which is only true because no bound public posts exist.
  Once they do, that assumption breaks. Change:
  - Items from a community source (`getTimeline`, carrying `ReasonCommunity`)
    set their target to `{kind: 'community', id, tier: 'public'}` from the
    source, not through `feedPostTarget`.
  - Posts from elsewhere (Following, threads, the video feed) need their
    binding from the AppView: the group AppView adds the binding to the post
    view (shape is Q5). `feedPostTarget` returns the community target when a
    binding is present, `{kind: 'profile'}` only when the AppView positively
    says "no binding", and `undefined` otherwise, which `resolveTarget`
    refuses as `unknown-parent-target`.

### Non-member replies (OPEN)

D1 says a reply to a bound post binds. What happens when the replier is not
allowed to post in the group is not decided. Options:

- **(a) Refuse.** The composer refuses a reply into a community the viewer
  may not post in (client pre-check), and the AppView does not index such a
  binding (enforcement, as in 2). The non-member cannot reply in-app at all.
- **(b) Reply unbound.** The reply is written as a plain profile reply with
  no binding. This is a deliberate, visible exception to "a reply inherits
  its parent's target", needs its own route, and the reply is not part of the
  community thread view.

Recommendation: (a), because it keeps the "inherit, never silently become a
profile post" rule with no exception. Decision: **OPEN (Q4)**.

### D2. Edits: not supported (decision, with an OPEN follow-up)

The app has no post edit today, and this design adds none. Decision: a bound
post is not edited. If post editing is added later (a `putRecord` of the
`app.bsky.feed.post`), the post's CID changes and `subject.cid` in its binding
dangles, the same problem as `group.cid` in 1. Before any edit feature ships,
one of: rewrite the binding in the same `applyWrites` as the edit (new
`subject.cid`), or have the AppView resolve bindings by `subject.uri` only.
That choice is **OPEN (Q11)** and blocks an edit feature, not this design.

### D3. Deletes (OPEN)

Today deleting a post deletes only the `app.bsky.feed.post`. With a binding,
that leaves an orphaned `com.authorityone.group.post`. Options:

- **(a) Client deletes both in one `applyWrites`.** Post delete and binding
  delete (same rkey, so the binding is found without a lookup) in one commit.
  The AppView also drops bindings whose subject no longer exists, because
  other clients will delete only the post.
- **(b) Client deletes only the post.** The AppView treats a binding whose
  subject is gone as dead and drops it; the orphan record stays in the
  author's repo.

Recommendation: (a), with the AppView rule from (b) as the backstop, since
the same-rkey choice makes the paired delete trivial and leaves no orphan
records from our own client. Decision: **OPEN (Q6)**.

## 4. Resolver once binding exists

`resolveTarget` changes in exactly one place: `ok()` stops refusing
`{kind: 'community', tier: 'public'}` and returns
`{ok: true, target, route: 'pds-community', locked}`.

- New route `'pds-community'`, distinct from `'pds'`. The composer's publish
  step switches on route: `'pds'` calls `apilib.post` with no binding;
  `'pds-community'` calls `apilib.post` with a required `group` and throws if
  it is missing. `'communities'` is unchanged.
- Everything else stays: flag off refuses community targets, the lock rules,
  the reply inheritance, the unknown-parent refusal.
- `apilib.post` gets a `binding?: {group}` option. With a public community
  target and no binding, it throws before building any write.

The tests that prove a public target never becomes a profile post:

1. `resolveTarget` table: public target (explicit, inherited, locked) with the
   flag on resolves to route `'pds-community'`, never `'pds'`.
2. `apilib.post` with mocked `applyWrites`: for a public community submit, the
   single call's `writes` contains, for every `app.bsky.feed.post` create, a
   `com.authorityone.group.post` create with the same rkey,
   `subject.uri` equal to that post's URI, `subject.cid` equal to its computed
   CID, and `group` equal to the resolved group. Assert there is exactly one
   `applyWrites` call and no `createRecord` call. Assert the `validate` value
   is the one chosen under Q7.
3. Group CID fetch fails (only under option (b) of Q1): assert `applyWrites`
   is never called.
4. Route `'pds-community'` with no group ref: `apilib.post` throws and
   `applyWrites` is never called.
5. Composer-level: public community target end-to-end with the publish
   mocked; the only PDS write is the batched one from test 2.
6. CID equality (required): with `applyWrites` returning `results[]`, assert
   that each post's locally computed CID equals `results[i].cid`, and that
   when a mocked result returns a different CID, `apilib.post` fails (throws /
   reports failure) rather than returning success. Plus one integration test
   against a real PDS (local dev PDS) that posts a bound thread and checks the
   returned CIDs equal the computed ones, so a `computeCid` / DAG-CBOR
   mismatch is caught for real, not only against a mock.
7. `submitComposerThread` with a public target and no `'pds-community'` route:
   asserts it does **not** call `apilib.post` unbound (see 5).

## 5. Flags

The whole path stays behind `EXPO_PUBLIC_COMMUNITIES_ENABLED`, default
`"false"` in every `eas.json` profile (base, development, preview,
production, production-apk, testflight, testflight-android are all `"false"`
at `1201076cc`, and stay so). No new flag is proposed.

With the flag off, `resolveTarget` refuses every community target before the
new route is reachable. That makes **`resolveTarget`'s output**
byte-identical to today. It is not the only gate.

**Second gate: `guardComposerPdsWrite`** (`src/lib/communities/composerTarget.ts:72`).
It already returns `{allowed: true}` for a public community target, with no
flag check and no route check. Everything that calls it directly (not via
`resolveTarget`) lets a public target write to the PDS today:

- drafts: `assertComposerPdsWrite` in
  `src/view/com/composer/drafts/state/queries.ts` (save, delete) and
  `src/view/com/composer/drafts/DraftsListDialog.tsx`;
- blobs: `assertComposerPdsWrite(target, 'com.atproto.repo.uploadBlob')` in
  `src/view/com/composer/Composer.tsx`;
- video: `src/view/com/composer/state/video.ts:276`;
- publish: `submitComposerThread`
  (`src/view/com/composer/state/submit.ts:69`), which on `allowed`
  calls `apilib.post` with **no binding**. A public target that reached it
  without going through `resolveTarget` would become a plain profile post.

These are only safe today because nothing produces a public target while the
flag is off and `resolveTarget` refuses public. What must change before the
flag can go on:

1. `guardComposerPdsWrite` (or its callers) must check the flag for every
   community target, so flag-off behaviour does not depend on `resolveTarget`
   having run first.
2. `submitComposerThread` must not send a public community target down the
   unbound `apilib.post` path: it routes public to the bound path (or
   refuses), mirroring `gateComposerWrite`, which already refuses any route
   other than `'pds'` (`writeGate.ts`). Test 7 in 4 covers it.
3. Decide whether drafts, blobs and video for a public target are intended
   (they are public content, so writing them to the PDS is consistent with
   the tier), and record that in the guard's doc comment so the
   `{allowed: true}` is deliberate rather than incidental.

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

## 7. Decisions in this revision

- D1. Replies to a bound post bind to the same community (3).
- D2. Bound posts are not editable; no edit feature is added (3).
- The binding and its post are written in one `applyWrites` (2).
- The CID check in 2 and test 6 are required.
- The AppView enforces posting policy; the client check is UX only (2).
- The flag-on prerequisites in 5 are required before the flag goes on.

## 8. Open questions for Elliott

Items marked **OPEN** above carry options and a recommendation.

1. **OPEN.** `group`: (a) plain AT-URI, no CID (recommended), or (b) keep the
   strongRef with a superseded-CID resolution rule. Changes the existing
   lexicon under (a). See 1.
2. Should the binding rkey equal the post rkey (one binding per post,
   idempotent), or stay a free TID (allows a post in several communities)?
3. Can one public post belong to more than one community?
4. **OPEN.** Non-member replies: (a) refuse (recommended), or (b) write an
   unbound profile reply. See 3.
5. How should the AppView expose a post's binding in ordinary post views
   (Following, threads), so `feedPostTarget` can stop assuming "profile"?
6. **OPEN.** Deletes: (a) client deletes post and binding in one
   `applyWrites`, AppView drops orphans as backstop (recommended), or (b)
   client deletes only the post, AppView drops orphans. See 3.
7. **OPEN.** Validation: (a) `validate: false` for the community batch with
   mandatory client-side validation (recommended), or (b) load our lexicons on
   the PDS. Either way, verify against the real PDS first. See 2.
8. Should a bound public post also appear on the author's profile feed, or be
   filtered from it by the AppView?
9. Is "add an existing post to a community" (the old two-step mutation) a
   feature we want, or should `usePostToGroupMutation` be removed?
10. Resolved: the AppView must enforce posting policy (2). Remaining question:
    what the AppView does with a binding whose author later leaves or is
    removed from the group (keep, hide, drop).
11. **OPEN (blocks a future edit feature, not this design).** If post edit is
    added: rewrite the binding in the same `applyWrites`, or have the AppView
    resolve bindings by `subject.uri` only. See 3, D2.
