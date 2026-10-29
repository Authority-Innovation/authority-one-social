/**
 * One post in a members-only community thread, with the community agent slot.
 *
 * Successor to the agent styling in `screens/Messages/SmsGroupThread.tsx`
 * (MessageRow): that mirror trusts `is_agent` alone, while a community thread
 * applies the N1 rule in `./labelRule.ts`. With EXPO_PUBLIC_COMMUNITIES_ENABLED
 * off, every author renders as a member and no agent UI is shown.
 */
import {useState} from 'react'
import {Linking, Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {logger} from '#/logger'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {COMMUNITIES_ENABLED} from '#/env'
import {isCommunityAdmin} from './isCommunityAdmin'
import {type AuthorLabel, resolveAuthorLabel} from './labelRule'
import {
  type CommunityAgentConfig,
  type CommunitySource,
  type CommunityThreadPostData as Post,
} from './types'

const AVATAR_SIZE = 36

export function CommunityThreadPost({
  post,
  community,
}: {
  post: Post
  community: CommunityAgentConfig | null | undefined
}) {
  const t = useTheme()
  const {i18n} = useLingui()

  const label: AuthorLabel = COMMUNITIES_ENABLED
    ? resolveAuthorLabel(post.author, community)
    : {kind: 'member'}
  const isAgent = label.kind === 'agent'
  const isOperator = isCommunityAdmin(community)

  if (label.kind === 'member' && label.warning) {
    // No DIDs in logs, only the community id the operator already knows.
    logger.warn('communityAgent: agent reply without sponsor', {
      communityId: community?.id,
    })
  }

  const when = post.createdAt
    ? i18n.date(new Date(post.createdAt), {timeStyle: 'short'})
    : ''

  return (
    <View
      testID={isAgent ? 'communityPostAgent' : 'communityPostMember'}
      style={[a.flex_row, a.gap_sm, a.py_md]}>
      <View testID={isAgent ? 'communityAgentAvatar' : 'communityMemberAvatar'}>
        <UserAvatar
          type="user"
          shape={isAgent ? 'square' : 'circle'}
          size={AVATAR_SIZE}
        />
      </View>
      <View style={[a.flex_1, a.gap_xs]}>
        <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
          <Text emoji style={[a.text_sm, a.font_bold]}>
            {post.authorId}
          </Text>
          {isAgent ? <AgentPill /> : null}
          {when ? (
            <Text style={[a.text_xs, t.atoms.text_contrast_low]}>· {when}</Text>
          ) : null}
        </View>

        {label.kind === 'agent' ? (
          <SponsorLine sponsorName={label.sponsorName} />
        ) : null}

        {label.kind === 'member' && label.warning && isOperator ? (
          <OperatorWarning />
        ) : null}

        {post.text ? (
          <Text emoji style={[a.text_md, a.leading_snug]}>
            {post.text}
          </Text>
        ) : null}

        {isAgent ? (
          <>
            <SourcesBlock sources={post.sources ?? []} />
            <WhyAgentDisclosure
              disclosureUrl={community?.agentDisclosureUrl}
              sponsorName={label.kind === 'agent' ? label.sponsorName : ''}
            />
          </>
        ) : null}
      </View>
    </View>
  )
}

export function AgentPill() {
  const t = useTheme()
  const {t: l} = useLingui()
  return (
    <View
      testID="communityAgentPill"
      accessibilityLabel={l`AI agent`}
      accessibilityHint={l`This reply was written by the community’s AI agent`}
      style={[
        a.px_xs,
        a.rounded_xs,
        t.atoms.bg_contrast_50,
        {paddingVertical: 1},
      ]}>
      <Text style={[a.text_2xs, a.font_bold, t.atoms.text_contrast_high]}>
        <Trans comment="Fixed label on a community agent's reply">
          ◆ Agent
        </Trans>
      </Text>
    </View>
  )
}

function SponsorLine({sponsorName}: {sponsorName: string}) {
  const t = useTheme()
  return (
    <Text
      testID="communityAgentSponsor"
      emoji
      style={[a.text_xs, t.atoms.text_contrast_medium]}>
      {sponsorName ? (
        <Trans comment="Under an AI agent's name; the sponsor is the account accountable for the agent">
          AI agent · run by {sponsorName}
        </Trans>
      ) : (
        <Trans>AI agent</Trans>
      )}
    </Text>
  )
}

function OperatorWarning() {
  const t = useTheme()
  return (
    <Text
      testID="communityAgentNoSponsorWarning"
      style={[a.text_xs, {color: t.palette.negative_500}]}>
      <Trans comment="Shown to community admins only">
        This reply came from an agent, but the community has no agent sponsor
        set, so it is shown as a member. Add a sponsor in the community
        settings.
      </Trans>
    </Text>
  )
}

export function SourcesBlock({sources}: {sources: CommunitySource[]}) {
  const t = useTheme()
  const valid = sources.filter(s => !!sourceLabel(s))

  if (valid.length === 0) {
    return (
      <Text
        testID="communityAgentNoSource"
        style={[a.text_xs, a.italic, t.atoms.text_contrast_medium]}>
        <Trans>No source cited</Trans>
      </Text>
    )
  }

  return (
    <View
      testID="communityAgentSources"
      style={[
        a.p_sm,
        a.gap_xs,
        a.rounded_sm,
        a.border,
        t.atoms.border_contrast_low,
      ]}>
      <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
        {valid.length === 1 ? (
          <Trans context="heading">Source</Trans>
        ) : (
          <Trans context="heading">Sources</Trans>
        )}
      </Text>
      {valid.map((s, i) => (
        <SourceRow key={`${s.ref ?? s.title}-${i}`} source={s} />
      ))}
    </View>
  )
}

function SourceRow({source}: {source: CommunitySource}) {
  const t = useTheme()
  const {t: l, i18n} = useLingui()
  const url = isPublicUrl(source.ref) ? source.ref : null
  const title = sourceLabel(source)
  const date = source.at ? new Date(source.at) : null
  const meta = [
    source.kind || null,
    date && !isNaN(date.getTime())
      ? i18n.date(date, {dateStyle: 'medium'})
      : null,
  ].filter(Boolean)

  return (
    <View testID="communityAgentSource" style={[a.gap_2xs]}>
      {url ? (
        <Text
          accessibilityRole="link"
          accessibilityHint={l`Opens the cited source`}
          onPress={() => void Linking.openURL(url)}
          emoji
          style={[a.text_sm, a.underline, {color: t.palette.primary_500}]}>
          {title}
        </Text>
      ) : (
        <Text emoji style={[a.text_sm]}>
          {title}
        </Text>
      )}
      {meta.length > 0 ? (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {meta.join(' · ')}
        </Text>
      ) : null}
    </View>
  )
}

function WhyAgentDisclosure({
  disclosureUrl,
  sponsorName,
}: {
  disclosureUrl?: string | null
  sponsorName: string
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const [open, setOpen] = useState(false)
  const url = isPublicUrl(disclosureUrl) ? disclosureUrl : null

  return (
    <View style={[a.gap_xs]}>
      <Pressable
        testID="communityAgentWhy"
        accessibilityRole="button"
        accessibilityState={{expanded: open}}
        accessibilityLabel={l`Why am I seeing an agent?`}
        accessibilityHint={l`Explains why an AI agent is in this thread`}
        onPress={() => setOpen(o => !o)}>
        <Text style={[a.text_xs, {color: t.palette.primary_500}]}>
          <Trans>Why am I seeing an agent?</Trans>
        </Text>
      </Pressable>
      {open ? (
        <View testID="communityAgentWhyBody" style={[a.gap_xs]}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {sponsorName ? (
              <Trans>
                {sponsorName} added this agent to the community. It answers from
                the community’s own material and says which item it used. It
                can’t see your profile or your other communities.
              </Trans>
            ) : (
              <Trans>
                This community has an AI agent. It answers from the community’s
                own material and says which item it used. It can’t see your
                profile or your other communities.
              </Trans>
            )}
          </Text>
          {url ? (
            <Text
              testID="communityAgentDisclosureLink"
              accessibilityRole="link"
              accessibilityHint={l`Opens the community’s agent disclosure`}
              onPress={() => void Linking.openURL(url)}
              style={[a.text_xs, a.underline, {color: t.palette.primary_500}]}>
              <Trans>Read the community’s agent disclosure</Trans>
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

// The door keeps a source when it has a title or a ref; show whichever it has.
function sourceLabel(source: CommunitySource | null | undefined): string {
  if (!source) return ''
  return source.title?.trim() || source.ref?.trim() || ''
}

// Sources and disclosures must be public links; anything else is not opened.
function isPublicUrl(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^https:\/\//i.test(v.trim())
}
