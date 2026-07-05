import {
  AppBskyFeedDefs,
  AppBskyFeedPost,
  type AppBskyRichtextFacet,
} from '@atproto/api'
import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {
  type AgentPostErrorCode,
  deleteAgentPost,
  editAgentPost,
  postAsAgent,
} from '#/lib/agent-runtime'
import {updatePostShadow} from '#/state/cache/post-shadow'
import {RQKEY as postRQKEY} from '#/state/queries/post'
import {
  type FeedPageUnselected,
  RQKEY_ROOT as postFeedQueryKeyRoot,
} from '#/state/queries/post-feed'
import {postThreadQueryKeyRoot} from '#/state/queries/usePostThread/types'
import * as bsky from '#/types/bsky'

/**
 * Owner-initiated management writes on an agent's posts. These call the
 * ownership-scoped runtime endpoints — NOT the local session (the human doesn't
 * hold the agent's credentials) and NOT the agent's LLM (management is
 * deterministic). Mirrors the upstream self-post mutations in ./post.ts.
 */

/** Typed failure so callers can branch on the runtime's machine-readable code. */
export class AgentPostActionError extends Error {
  code?: AgentPostErrorCode
  constructor(message: string, code?: AgentPostErrorCode) {
    super(message)
    this.name = 'AgentPostActionError'
    this.code = code
  }
}

/**
 * Delete a post authored by one of the viewer's agents (POST
 * /app/agents/posts/delete). Clone of `usePostDeleteMutation`: on success the
 * post shadow is marked deleted so every feed/thread drops it optimistically;
 * the PDS delete -> firehose -> AppView round-trip makes it durable.
 */
export function useAgentPostDeleteMutation() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, {agent: string; uri: string}>({
    mutationFn: async ({agent, uri}) => {
      const res = await deleteAgentPost({agent, uri})
      if (!res.ok) {
        throw new AgentPostActionError(
          res.signedOut
            ? 'Not signed in'
            : (res.error ?? 'Could not delete the post'),
          res.code,
        )
      }
    },
    onSuccess(_, variables) {
      updatePostShadow(queryClient, variables.uri, {isDeleted: true})
    },
  })
}

type PostTextEdit = {
  text: string
  facets?: AppBskyRichtextFacet.Main[]
  /** The post-edit CID from the runtime; kept when absent (cache stays usable). */
  cid?: string
}

/** A PostView with the edited text/facets (and new cid) applied to its record.
 *  Generic so `$Typed<PostView>` inputs (feed reply refs) keep their type. */
function editedPostView<T extends AppBskyFeedDefs.PostView>(
  post: T,
  edit: PostTextEdit,
): T {
  if (
    !bsky.dangerousIsType<AppBskyFeedPost.Record>(
      post.record,
      AppBskyFeedPost.isRecord,
    )
  ) {
    return post
  }
  return {
    ...post,
    cid: edit.cid ?? post.cid,
    record: {...post.record, text: edit.text, facets: edit.facets},
  }
}

/**
 * Optimistically apply an in-place post edit (same uri, new cid) to the query
 * caches: the single-post cache and every raw feed page (their `select` re-runs,
 * so rendered feeds update immediately). Thread views cache a different shape —
 * those are just invalidated; the AppView indexes the update op off the firehose
 * within ~seconds, so a refetch converges.
 */
export function updateAgentPostInCache(
  queryClient: QueryClient,
  uri: string,
  edit: PostTextEdit,
) {
  queryClient.setQueryData<AppBskyFeedDefs.PostView>(
    postRQKEY(uri),
    old => old && editedPostView(old, edit),
  )
  queryClient.setQueriesData<InfiniteData<FeedPageUnselected>>(
    {queryKey: [postFeedQueryKeyRoot]},
    old => {
      if (!old) return old
      let changed = false
      const pages = old.pages.map(page => {
        let pageChanged = false
        const feed = page.feed.map(item => {
          let next = item
          if (item.post.uri === uri) {
            next = {...next, post: editedPostView(item.post, edit)}
            pageChanged = true
          }
          const reply = next.reply
          if (reply) {
            const parent =
              AppBskyFeedDefs.isPostView(reply.parent) &&
              reply.parent.uri === uri
                ? editedPostView(reply.parent, edit)
                : reply.parent
            const root =
              AppBskyFeedDefs.isPostView(reply.root) && reply.root.uri === uri
                ? editedPostView(reply.root, edit)
                : reply.root
            if (parent !== reply.parent || root !== reply.root) {
              next = {...next, reply: {...reply, parent, root}}
              pageChanged = true
            }
          }
          return next
        })
        if (!pageChanged) return page
        changed = true
        return {...page, feed}
      })
      return changed ? {...old, pages} : old
    },
  )
  void queryClient.invalidateQueries({queryKey: [postThreadQueryKeyRoot]})
}

/**
 * Edit a post authored by one of the viewer's agents in place (POST
 * /app/agents/posts/edit — atproto update op: same uri, new cid; embeds
 * preserved server-side). On success the new text/facets are patched into the
 * query caches so every rendered copy updates immediately; the firehose ->
 * AppView round-trip makes it durable. The UI must surface the engagement
 * caveat first: likes/reposts/replies reference the pre-edit version.
 */
export function useAgentPostEditMutation() {
  const queryClient = useQueryClient()
  return useMutation<
    {uri: string; cid?: string},
    Error,
    {
      agent: string
      uri: string
      text: string
      facets?: AppBskyRichtextFacet.Main[]
    }
  >({
    mutationFn: async input => {
      const res = await editAgentPost(input)
      if (!res.ok) {
        throw new AgentPostActionError(
          res.signedOut
            ? 'Not signed in'
            : (res.error ?? 'Could not edit the post'),
          res.code,
        )
      }
      return {uri: res.uri ?? input.uri, cid: res.cid}
    },
    onSuccess(data, variables) {
      updateAgentPostInCache(queryClient, variables.uri, {
        text: variables.text,
        facets: variables.facets,
        cid: data.cid,
      })
    },
  })
}

/**
 * Publish a post as one of the viewer's agents, verbatim (POST /app/agents/posts).
 * Text/facets/hosted image urls only — the runtime writes the record as given.
 */
export function usePostAsAgentMutation() {
  return useMutation<
    {uri?: string; cid?: string},
    Error,
    Parameters<typeof postAsAgent>[0]
  >({
    mutationFn: async input => {
      const res = await postAsAgent(input)
      if (!res.ok) {
        throw new AgentPostActionError(
          res.signedOut
            ? 'Not signed in'
            : (res.error ?? 'Could not publish the post'),
          res.code,
        )
      }
      return {uri: res.uri, cid: res.cid}
    },
  })
}
