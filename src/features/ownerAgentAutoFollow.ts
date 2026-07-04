import {useEffect, useRef} from 'react'
import {type BskyAgent} from '@atproto/api'

import {fetchOwnerAgents} from '#/lib/agent-runtime'
import {logger} from '#/logger'
import {useAgent, useSession} from '#/state/session'

/**
 * OWNER -> AGENT AUTO-FOLLOW. Agents already follow their owners (server-side);
 * this closes the other direction so an owner's own agents appear in their feed
 * and graph. On each app load with a session we idempotently ensure the owner
 * follows every agent from GET /app/agents.
 *
 * Idempotency is authoritative, not heuristic: the already-following set is read
 * from the OWNER'S OWN REPO (com.atproto.repo.listRecords of app.bsky.graph.follow
 * on the PDS), so it never depends on AppView viewer-state hydration and can never
 * create duplicate follow records. Owned-agents-only (the runtime resolves
 * ownership from the session), quiet on every failure, safe to run every load.
 */

const FOLLOW_COLLECTION = 'app.bsky.graph.follow'
/** 100 records/page; 30 pages = 3k follows scanned, far beyond pilot scale. If an
 *  account somehow exceeds this, we stop and skip following (never risk a dup). */
const MAX_FOLLOW_PAGES = 30
/** Let the boot request burst settle before doing background graph work. */
const START_DELAY_MS = 4000

/** Every DID the owner's repo currently follows. Throws on transport failure. */
async function listFollowedDids(
  agent: BskyAgent,
  repo: string,
): Promise<Set<string> | null> {
  const out = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < MAX_FOLLOW_PAGES; page++) {
    const res = await agent.com.atproto.repo.listRecords({
      repo,
      collection: FOLLOW_COLLECTION,
      limit: 100,
      cursor,
    })
    for (const rec of res.data.records) {
      const subject = (rec.value as {subject?: unknown})?.subject
      if (typeof subject === 'string') out.add(subject)
    }
    cursor = res.data.cursor
    if (!cursor || res.data.records.length === 0) return out
  }
  // Page cap hit: the set is INCOMPLETE. Signal the caller to skip rather than
  // follow someone who may already be followed beyond the scanned window.
  return null
}

/** Resolve each owned agent to a DID (rows usually carry one; else the PDS). */
async function resolveAgentDids(
  agent: BskyAgent,
  rows: {handle: string; did?: string}[],
): Promise<string[]> {
  const dids: string[] = []
  for (const row of rows) {
    if (row.did?.startsWith('did:')) {
      dids.push(row.did)
      continue
    }
    try {
      const res = await agent.resolveHandle({handle: row.handle})
      if (res.data.did) dids.push(res.data.did)
    } catch {
      // Unresolvable handle — skip this agent quietly.
    }
  }
  return dids
}

/** One idempotent pass: follow any owned agent the owner doesn't follow yet. */
export async function ensureOwnerFollowsAgents(
  agent: BskyAgent,
): Promise<void> {
  try {
    const ownerDid = agent.did
    if (!ownerDid) return
    const {agents, signedOut} = await fetchOwnerAgents()
    if (signedOut || agents.length === 0) return
    const targetDids = await resolveAgentDids(agent, agents)
    if (targetDids.length === 0) return
    const followed = await listFollowedDids(agent, ownerDid)
    if (followed === null) return
    for (const did of targetDids) {
      if (did === ownerDid || followed.has(did)) continue
      try {
        await agent.follow(did)
        logger.debug('ownerAgentAutoFollow: followed agent', {did})
      } catch (e) {
        // Per-agent failure never blocks the rest, and never surfaces UI.
        logger.debug('ownerAgentAutoFollow: follow failed', {
          safeMessage: String(e),
        })
      }
    }
  } catch (e) {
    logger.debug('ownerAgentAutoFollow: skipped', {safeMessage: String(e)})
  }
}

/**
 * Mount once in the shell. Runs one quiet auto-follow pass per signed-in account
 * per app session, shortly after load.
 */
export function OwnerAgentAutoFollow(): null {
  const {hasSession, currentAccount} = useSession()
  const agent = useAgent()
  const ranForDid = useRef<string | null>(null)

  const did = currentAccount?.did
  useEffect(() => {
    if (!hasSession || !did || ranForDid.current === did) return
    ranForDid.current = did
    const timer = setTimeout(() => {
      void ensureOwnerFollowsAgents(agent)
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [hasSession, did, agent])

  return null
}
