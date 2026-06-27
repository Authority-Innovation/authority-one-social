import {useState} from 'react'
import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {type GroupMemberKind, type GroupOp, memberOpFor} from '#/lib/agent-runtime'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useActorAutocompleteQuery} from '#/state/queries/actor-autocomplete'
import {usePersonasQuery} from '#/state/queries/personas'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {useGroupOpMutation} from '#/state/queries/threads'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'

/**
 * Add members to a group. FRIENDS (people the owner already follows / is connected to)
 * are ADDED directly; anyone else found via search is INVITED (they must accept). Agent
 * PERSONAS are added directly. The friend-vs-invite decision is the pure `memberOpFor`.
 */
export function AddPeople({threadId}: {threadId: string}) {
  const {currentAccount} = useSession()
  const followsQuery = useProfileFollowsQuery(currentAccount?.did)
  const {data: personas} = usePersonasQuery()
  const op = useGroupOpMutation()

  const [search, setSearch] = useState('')
  const searchQuery = useActorAutocompleteQuery(search, true)

  // Local "done" set so each row reflects added/invited without a members endpoint.
  const [done, setDone] = useState<Record<string, GroupOp>>({})

  const follows =
    followsQuery.data?.pages.flatMap(page => page.follows) ?? []
  const friendIds = new Set(follows.map(f => f.did))

  const act = (
    memberId: string,
    memberKind: GroupMemberKind,
    chosenOp: GroupOp,
  ) => {
    op.mutate(
      {threadId, op: chosenOp, memberId, memberKind},
      {onSuccess: () => setDone(prev => ({...prev, [memberId]: chosenOp}))},
    )
  }

  const searchResults = (searchQuery.data ?? []).filter(
    p => p.did !== currentAccount?.did,
  )

  return (
    <View style={[a.gap_lg]}>
      {/* Search to find anyone (friends -> Add, others -> Invite) */}
      <View style={[a.gap_xs]}>
        <TextField.LabelText>
          <Trans>Find people</Trans>
        </TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label="Search people"
            placeholder="Search by name or handle"
            defaultValue={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </TextField.Root>
        {search.length > 0 ? (
          searchResults.length > 0 ? (
            searchResults.map(p => {
              const chosen = memberOpFor('person', p.did, friendIds)
              return (
                <PersonRow
                  key={p.did}
                  profile={p}
                  cta={chosen === 'invite' ? 'Invite' : 'Add'}
                  doneOp={done[p.did]}
                  pending={op.isPending}
                  onPress={() => act(p.did, 'person', chosen)}
                />
              )
            })
          ) : (
            <Empty text="No matches" />
          )
        ) : null}
      </View>

      {/* Friends (already-connected) — direct add */}
      <Section title="Friends">
        {follows.length === 0 ? (
          <Empty text="People you follow appear here" />
        ) : (
          follows.slice(0, 50).map(f => (
            <PersonRow
              key={f.did}
              profile={f}
              doneOp={done[f.did]}
              pending={op.isPending}
              onPress={() => act(f.did, 'person', 'add')}
            />
          ))
        )}
      </Section>

      {/* Agent personas — direct add */}
      <Section title="Agent personas">
        {(personas?.personas ?? []).length === 0 ? (
          <Empty text="No personas" />
        ) : (
          (personas?.personas ?? []).map(persona => (
            <Row
              key={persona.id}
              title={persona.name}
              subtitle="Agent persona"
              doneOp={done[persona.id]}
              pending={op.isPending}
              onPress={() => act(persona.id, 'persona', 'add')}
            />
          ))
        )}
      </Section>
    </View>
  )
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
        {title}
      </Text>
      {children}
    </View>
  )
}

function Empty({text}: {text: string}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, a.py_xs, t.atoms.text_contrast_low]}>{text}</Text>
  )
}

function PersonRow({
  profile,
  cta = 'Add',
  doneOp,
  pending,
  onPress,
}: {
  // Minimal shape shared by getFollows' ProfileView and search's ProfileViewBasic.
  profile: {did: string; handle: string; displayName?: string}
  cta?: string
  doneOp?: GroupOp
  pending: boolean
  onPress: () => void
}) {
  return (
    <Row
      title={sanitizeDisplayName(profile.displayName || profile.handle)}
      subtitle={sanitizeHandle(profile.handle, '@')}
      cta={cta}
      doneOp={doneOp}
      pending={pending}
      onPress={onPress}
    />
  )
}

function Row({
  title,
  subtitle,
  cta = 'Add',
  doneOp,
  pending,
  onPress,
}: {
  title: string
  subtitle?: string
  cta?: string
  doneOp?: GroupOp
  pending: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm, a.py_xs]}>
      <View style={[a.flex_1]}>
        <Text emoji style={[a.text_md, a.font_bold, t.atoms.text]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {doneOp ? (
        <Text style={[a.text_sm, a.font_bold, {color: t.palette.positive_600}]}>
          {doneOp === 'invite' ? 'Invited' : 'Added'}
        </Text>
      ) : (
        <Button
          label={`${cta} ${title}`}
          size="small"
          variant="solid"
          color="secondary"
          disabled={pending}
          onPress={onPress}>
          <ButtonText>{cta}</ButtonText>
        </Button>
      )}
    </View>
  )
}
