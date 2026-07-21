import {useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {
  type OwnerAgent,
  type Persona,
  voiceDisplayLabel,
  voicePickOptions,
} from '#/lib/agent-runtime'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {
  useOwnerAgentsQuery,
  usePauseOwnerAgentMutation,
} from '#/state/queries/agents'
import {PersonaWriteError, usePersonasQuery} from '#/state/queries/personas'
import {useVoiceRegistryQuery} from '#/state/queries/voices'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import * as Dialog from '#/components/Dialog'
import {PageText_Stroke2_Corner0_Rounded as PageTextIcon} from '#/components/icons/PageText'
import {Pause_Stroke2_Corner0_Rounded as PauseIcon} from '#/components/icons/Pause'
import {PencilLine_Stroke2_Corner0_Rounded as PencilIcon} from '#/components/icons/Pencil'
import {Person_Stroke2_Corner0_Rounded as PersonIcon} from '#/components/icons/Person'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {Play_Stroke2_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/Speaker'
import {Ticket_Stroke2_Corner0_Rounded as TicketIcon} from '#/components/icons/Ticket'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {AgentProfileDialog} from './AgentProfileDialog'
import {personaEditTarget} from './editTarget'
import {PersonaEditorDialog} from './PersonaEditorDialog'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PersonaSettings'>

/**
 * The per-agent settings hub, organized into four buckets:
 *   1. Who they are - identity (name/personality/reference images), public
 *      profile, voice
 *   2. What they know - knowledge base
 *   3. How they reach you - phone line, social autonomy
 *   4. Danger zone - billing, pause
 *
 * The multi-persona switcher (persona list / create / switch-active) is HIDDEN,
 * not deleted: the agent presents as ONE identity, edited in place via the
 * ACTIVE persona (personaEditTarget - some live agents' active persona is not
 * their first record, so "active" is the only safe edit target). The persona
 * data model, runtime CRUD, and any extra stored personas are untouched and the
 * switcher can be restored by reverting this screen.
 *
 * Optionally SCOPED to one of the owner's agents via route param `agent` (the
 * FULL handle from My Agents); without it, this manages the owner's
 * token-mapped agent exactly as before.
 */
export function PersonaSettingsScreen({route}: Props) {
  const {t: l} = useLingui()
  const t = useTheme()
  const agent = route.params?.agent
  const navigation = useNavigation<NavigationProp>()
  const {data, isLoading, error} = usePersonasQuery(agent)
  const ownerAgents = useOwnerAgentsQuery()
  const pause = usePauseOwnerAgentMutation()
  const editorControl = Dialog.useDialogControl()
  const profileControl = Dialog.useDialogControl()
  const [editing, setEditing] = useState<Persona | null>(null)

  const personas = data?.personas ?? []
  const voices = data?.voices ?? []
  // Voice REGISTRY (builtins + custom library). Personas may store the new
  // `builtin:`/`voice:` forms, which the legacy flat list can't label.
  const voiceRegistry = useVoiceRegistryQuery()
  const registryOptions = voiceRegistry.data
    ? voicePickOptions(voiceRegistry.data)
    : []
  const activeId = data?.activePersonaId
  // The ONE identity this screen edits: the active persona, in place.
  const identity = personaEditTarget(personas, activeId)
  // The Voice row shows what the agent sounds like right now - resolved from the
  // active persona's stored voiceId across all three stored forms.
  const activeStoredVoiceId = identity?.voiceId ?? data?.activeVoiceId
  const activeVoiceName =
    voiceDisplayLabel(registryOptions, activeStoredVoiceId) ??
    voices.find(v => v.voiceId === activeStoredVoiceId)?.name
  const agentRow = agent
    ? ownerAgents.data?.agents.find(
        a2 => a2.handle.toLowerCase() === agent.toLowerCase(),
      )
    : undefined
  const notYourAgent =
    error instanceof PersonaWriteError && error.code === 'not-your-agent'

  const openIdentityEditor = () => {
    setEditing(identity)
    editorControl.open()
  }

  const onTogglePause = (row: OwnerAgent) => {
    pause.mutate(
      {agent: row.handle, paused: row.paused !== true},
      {
        onSuccess: res => {
          if (res.ok) return
          Toast.show(
            res.code === 'not-your-agent'
              ? l`That agent isn’t linked to your account.`
              : (res.error ?? l`Could not update the agent.`),
            {type: 'error'},
          )
        },
      },
    )
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            {agent ? (
              (agentRow?.displayName ?? sanitizeHandle(agent, '@'))
            ) : (
              <Trans>Your agent</Trans>
            )}
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          {agent ? <AgentInfo handle={agent} /> : null}

          {isLoading ? (
            <View style={[a.py_2xl, a.align_center]}>
              <ActivityIndicator />
            </View>
          ) : notYourAgent ? (
            <NotYourAgentNotice />
          ) : (
            <>
              {/* 1 - WHO THEY ARE */}
              <SectionHeaderText>
                <Trans>Who they are</Trans>
              </SectionHeaderText>
              {data ? (
                <SettingsList.PressableItem
                  label={l`Name & personality`}
                  accessibilityHint={l`Edit this agent's name, personality, and reference images`}
                  onPress={openIdentityEditor}>
                  <SettingsList.ItemIcon icon={PersonIcon} />
                  <SettingsList.ItemText>
                    <Trans>Name & personality</Trans>
                  </SettingsList.ItemText>
                  {identity ? (
                    <SettingsList.BadgeText>
                      {identity.name}
                    </SettingsList.BadgeText>
                  ) : null}
                  <SettingsList.Chevron />
                </SettingsList.PressableItem>
              ) : (
                <UnavailableNotice />
              )}
              {agent ? (
                // Profile editor needs an explicit agent target (handle/DID), so
                // it's only offered on the scoped editor opened from My Agents.
                <SettingsList.PressableItem
                  label={l`Public profile`}
                  accessibilityHint={l`Edit this agent's public profile`}
                  onPress={() => profileControl.open()}>
                  <SettingsList.ItemIcon icon={PencilIcon} />
                  <SettingsList.ItemText>
                    <Trans>Public profile</Trans>
                  </SettingsList.ItemText>
                  <SettingsList.Chevron />
                </SettingsList.PressableItem>
              ) : null}
              <SettingsList.PressableItem
                label={l`Voice`}
                accessibilityHint={l`Pick the voice this agent speaks with`}
                onPress={() =>
                  navigation.navigate(
                    'VoiceSettings',
                    agent ? {agent} : undefined,
                  )
                }>
                <SettingsList.ItemIcon icon={SpeakerIcon} />
                <SettingsList.ItemText>
                  <Trans>Voice</Trans>
                </SettingsList.ItemText>
                {activeVoiceName ? (
                  <SettingsList.BadgeText>
                    {activeVoiceName}
                  </SettingsList.BadgeText>
                ) : null}
                <SettingsList.Chevron />
              </SettingsList.PressableItem>

              {/* 2 - WHAT THEY KNOW */}
              <SettingsList.Divider />
              <SectionHeaderText>
                <Trans>What they know</Trans>
              </SectionHeaderText>
              <SettingsList.PressableItem
                label={l`Knowledge base`}
                accessibilityHint={l`Upload files into this agent's long-term memory`}
                onPress={() =>
                  navigation.navigate(
                    'KnowledgeBaseSettings',
                    agent ? {agent} : undefined,
                  )
                }>
                <SettingsList.ItemIcon icon={PageTextIcon} />
                <SettingsList.ItemText>
                  <Trans>Knowledge base</Trans>
                </SettingsList.ItemText>
                <SettingsList.Chevron />
              </SettingsList.PressableItem>

              {/* 3 - HOW THEY REACH YOU */}
              <SettingsList.Divider />
              <SectionHeaderText>
                <Trans>How they reach you</Trans>
              </SectionHeaderText>
              {agentRow?.number ? (
                <SettingsList.Item>
                  <SettingsList.ItemIcon icon={PhoneIcon} />
                  <SettingsList.ItemText>
                    <Trans>Phone number</Trans>
                  </SettingsList.ItemText>
                  <SettingsList.BadgeText>
                    {agentRow.number}
                  </SettingsList.BadgeText>
                </SettingsList.Item>
              ) : null}
              <SettingsList.PressableItem
                label={l`Social autonomy`}
                accessibilityHint={l`Opens this agent's social autonomy settings`}
                onPress={() =>
                  navigation.navigate(
                    'SocialAutonomySettings',
                    agent ? {agent} : undefined,
                  )
                }>
                <SettingsList.ItemIcon icon={SparkleIcon} />
                <SettingsList.ItemText>
                  <Trans>Social autonomy</Trans>
                </SettingsList.ItemText>
                <SettingsList.Chevron />
              </SettingsList.PressableItem>

              {/* 4 - DANGER ZONE */}
              <SettingsList.Divider />
              <SectionHeaderText destructive>
                <Trans>Danger zone</Trans>
              </SectionHeaderText>
              <SettingsList.PressableItem
                label={l`Plan and billing`}
                accessibilityHint={l`Opens your agent plan and billing`}
                onPress={() => navigation.navigate('AgentBilling')}>
                <SettingsList.ItemIcon icon={TicketIcon} />
                <SettingsList.ItemText>
                  <Trans>Plan & billing</Trans>
                </SettingsList.ItemText>
                <SettingsList.Chevron />
              </SettingsList.PressableItem>
              {agentRow ? (
                <SettingsList.PressableItem
                  label={
                    agentRow.paused === true
                      ? l`Resume this agent`
                      : l`Pause this agent`
                  }
                  accessibilityHint={l`Pauses or resumes this agent everywhere`}
                  disabled={pause.isPending}
                  onPress={() => onTogglePause(agentRow)}>
                  <SettingsList.ItemIcon
                    icon={agentRow.paused === true ? PlayIcon : PauseIcon}
                  />
                  <SettingsList.ItemText>
                    {agentRow.paused === true ? (
                      <Trans>Resume this agent</Trans>
                    ) : (
                      <Trans>Pause this agent</Trans>
                    )}
                  </SettingsList.ItemText>
                  <SettingsList.BadgeText>
                    {agentRow.paused === true ? l`Paused` : l`Live`}
                  </SettingsList.BadgeText>
                </SettingsList.PressableItem>
              ) : null}

              {error && data ? (
                <Text
                  style={[
                    a.px_lg,
                    a.pt_sm,
                    a.text_sm,
                    {color: t.palette.negative_500},
                  ]}>
                  <Trans>
                    Couldn’t refresh this agent’s settings. Showing the last
                    known state.
                  </Trans>
                </Text>
              ) : null}
            </>
          )}
        </SettingsList.Container>
      </Layout.Content>

      <PersonaEditorDialog
        control={editorControl}
        persona={editing}
        agent={agent}
      />

      {agent ? (
        <AgentProfileDialog control={profileControl} agent={agent} />
      ) : null}
    </Layout.Screen>
  )
}

/** Bucket header. `destructive` tints the label for the danger zone. */
function SectionHeaderText({
  children,
  destructive = false,
}: {
  children: React.ReactNode
  destructive?: boolean
}) {
  const t = useTheme()
  return (
    <Text
      style={[
        a.px_lg,
        a.pt_lg,
        a.pb_xs,
        a.text_sm,
        a.font_bold,
        destructive
          ? {color: t.palette.negative_500}
          : t.atoms.text_contrast_medium,
      ]}>
      {children}
    </Text>
  )
}

/** Which agent this screen is editing (scoped mode). */
function AgentInfo({handle}: {handle: string}) {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.pb_sm]}>
      <Text emoji style={[a.text_sm, t.atoms.text_contrast_medium]}>
        {sanitizeHandle(handle, '@')}
      </Text>
    </View>
  )
}

function NotYourAgentNotice() {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_2xl, a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
        <Trans>Not your agent</Trans>
      </Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        <Trans>
          This agent isn’t linked to your account, so it can’t be managed from
          here. Pick one of your own agents from My Agents.
        </Trans>
      </Text>
    </View>
  )
}

function UnavailableNotice() {
  const t = useTheme()
  return (
    <View style={[a.px_lg, a.py_lg, a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
        <Trans>Identity unavailable</Trans>
      </Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        <Trans>
          Make sure you're signed in and the agent runtime is reachable. Your
          agent keeps working with its current name and voice in the meantime.
        </Trans>
      </Text>
    </View>
  )
}
