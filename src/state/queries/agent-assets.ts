import {type InfiniteData, useInfiniteQuery} from '@tanstack/react-query'

import {
  type AgentAsset,
  type AgentAssetsPage,
  type AssetsQuery,
  type AssetType,
  fetchAgentAssets,
} from '#/lib/agent-runtime'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'

export const AGENT_ASSETS_QUERY_ROOT = 'agentAssets'

/** UI-facing time filter; mapped to the runtime's `since` param. */
export type AssetTimeFilter = 'all' | 'today' | 'week' | 'month'

export interface AssetGalleryFilters {
  /** undefined = all types. */
  type?: AssetType
  time: AssetTimeFilter
}

/** Map the coarse UI time filter onto the runtime's `since` query param. */
function sinceFor(time: AssetTimeFilter): string | undefined {
  switch (time) {
    case 'today':
      return 'today'
    case 'week':
      return 'week'
    case 'month':
      return 'month'
    case 'all':
    default:
      return undefined
  }
}

/**
 * Keyed by agent + the active filters so each type/time view caches (and
 * paginates) independently. Lowercased handle to match the other agent hooks.
 */
export const createAgentAssetsQueryKey = (args: {
  agent: string
  filters: AssetGalleryFilters
}) =>
  createQueryKey(AGENT_ASSETS_QUERY_ROOT, {
    agent: args.agent.toLowerCase(),
    type: args.filters.type ?? null,
    time: args.filters.time,
  })

/** An Error carrying the runtime's machine-readable ownership signal. */
export class AgentAssetsError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AgentAssetsError'
    this.code = code
  }
}

/**
 * The agent's asset ledger (GET /app/agents/:agent/assets) as an infinite,
 * cursor-paginated feed - the Gallery tab's source of truth. Newest-first; each
 * page carries the runtime's opaque `nextCursor` (null ends the feed). Degrades
 * to an empty feed when signed out / unreachable; throws an AgentAssetsError on
 * an ownership error (403) so the scoped screen can message it (retry disabled
 * for that case, since ownership won't change on retry).
 */
export function useAgentAssetsQuery(
  agent: string | undefined,
  filters: AssetGalleryFilters,
) {
  const since = sinceFor(filters.time)
  return useInfiniteQuery<
    AgentAssetsPage,
    AgentAssetsError,
    InfiniteData<AgentAssetsPage, string | undefined>,
    ReturnType<typeof createAgentAssetsQueryKey>,
    string | undefined
  >({
    queryKey: createAgentAssetsQueryKey({agent: agent ?? '', filters}),
    queryFn: async ({pageParam}) => {
      const query: AssetsQuery = {
        type: filters.type,
        since,
        cursor: pageParam,
      }
      const page = await fetchAgentAssets(agent ?? '', query)
      if (page.notOwned) {
        throw new AgentAssetsError(
          'This agent is not linked to your account.',
          'not-your-agent',
        )
      }
      return page
    },
    initialPageParam: undefined,
    // A page with a null cursor is the end of the feed.
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: !!agent,
    staleTime: STALE.MINUTES.ONE,
    retry: (failureCount, error) =>
      !(error instanceof AgentAssetsError && error.code === 'not-your-agent') &&
      failureCount < 3,
  })
}

/** Flatten paginated results into a single newest-first asset list. PURE. */
export function flattenAssetPages(
  pages: AgentAssetsPage[] | undefined,
): AgentAsset[] {
  if (!pages) return []
  return pages.flatMap(page => page.assets)
}

/** True when any loaded page flags its captions/provenance as untrusted. PURE. */
export function anyUntrustedCaptions(
  pages: AgentAssetsPage[] | undefined,
): boolean {
  return (pages ?? []).some(page => page.untrustedCaption)
}
