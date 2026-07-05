import {useState} from 'react'
import {View} from 'react-native'
import {
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  RichText,
} from '@atproto/api'
import {Trans} from '@lingui/react/macro'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {MAX_GRAPHEME_LENGTH} from '#/lib/constants'
import {shortenLinks, stripInvalidMentions} from '#/lib/strings/rich-text-manip'
import {logger} from '#/logger'
import {type Shadow} from '#/state/cache/post-shadow'
import {
  AgentPostActionError,
  useAgentPostEditMutation,
} from '#/state/queries/agent-posts'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

/**
 * Edit an agent-authored post in place: prefilled with the current text, saved
 * through the ownership-scoped runtime endpoint (POST /app/agents/posts/edit —
 * same uri, new cid; embeds preserved). Facets are re-detected client-side like
 * a normal post. Direct-manipulation plane: never the session repo, never the
 * agent's LLM.
 *
 * atproto caveat surfaced here: likes/reposts/replies reference the pre-edit
 * version, so a post WITH engagement shows a warning suggesting delete+repost —
 * the owner can still proceed.
 */
export function EditAgentPostDialog({
  control,
  agent,
  agentName,
  post,
  record,
}: {
  control: Dialog.DialogControlProps
  /** The owned agent's handle — the ref the runtime endpoint takes. */
  agent: string
  /** Display name for copy (plain literals — interpolated custom strings). */
  agentName: string
  post: Shadow<AppBskyFeedDefs.PostView>
  record: AppBskyFeedPost.Record
}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <EditAgentPostInner
        control={control}
        agent={agent}
        agentName={agentName}
        post={post}
        record={record}
      />
    </Dialog.Outer>
  )
}

function EditAgentPostInner({
  control,
  agent,
  agentName,
  post,
  record,
}: {
  control: Dialog.DialogControlProps
  agent: string
  agentName: string
  post: Shadow<AppBskyFeedDefs.PostView>
  record: AppBskyFeedPost.Record
}) {
  const t = useTheme()
  const sessionAgent = useAgent()
  const editMutation = useAgentPostEditMutation()
  const [text, setText] = useState(record.text)
  const [saving, setSaving] = useState(false)

  const graphemeCount = countGraphemes(text.trim())
  const overLimit = graphemeCount > MAX_GRAPHEME_LENGTH
  const canSave = text.trim().length > 0 && !overLimit && !saving

  const engagementCount =
    (post.likeCount ?? 0) + (post.repostCount ?? 0) + (post.replyCount ?? 0)

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      // Same facet pipeline as a normal post: detect (resolves mention DIDs
      // via the session agent — public reads), shorten links, strip invalid.
      let rt = new RichText(
        {text: text.replace(/^(\s*\n)+/, '').trimEnd()},
        {cleanNewlines: true},
      )
      await rt.detectFacets(sessionAgent)
      rt = shortenLinks(rt)
      rt = stripInvalidMentions(rt)

      await editMutation.mutateAsync({
        agent,
        uri: post.uri,
        text: rt.text,
        facets: rt.facets,
      })
      control.close(() => {
        Toast.show(`Updated ${agentName}’s post`, {type: 'success'})
      })
    } catch (e) {
      logger.error('Failed to edit agent post', {message: e})
      Toast.show(
        e instanceof AgentPostActionError && e.code === 'not-your-agent'
          ? `That agent isn’t linked to your account.`
          : e instanceof AgentPostActionError && e.code === 'too-long'
            ? `That post is too long.`
            : `Could not update the post. Please try again.`,
        {type: 'error'},
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.ScrollableInner label={`Edit ${agentName}’s post`}>
      <View style={[a.gap_md]}>
        <Text style={[a.text_xl, a.font_bold, t.atoms.text]}>
          {/* Plain literal: interpolated custom strings render raw ICU
              placeholders under the uncompiled catalog. */}
          {`Edit ${agentName}’s post`}
        </Text>

        {engagementCount > 0 ? (
          <Admonition type="warning">
            <Trans>
              This post already has likes, reposts or replies. They reference
              the current version, so editing may orphan them. Consider deleting
              this post and publishing a new one instead.
            </Trans>
          </Admonition>
        ) : null}

        <View>
          <TextField.LabelText>
            <Trans>Post text</Trans>
          </TextField.LabelText>
          <TextField.Root>
            <TextField.Input
              testID="editAgentPostTextInput"
              label={`Edit ${agentName}’s post text`}
              defaultValue={record.text}
              onChangeText={setText}
              multiline
              numberOfLines={5}
            />
          </TextField.Root>
          <Text
            style={[
              a.text_xs,
              a.pt_2xs,
              a.text_right,
              overLimit
                ? {color: t.palette.negative_500}
                : t.atoms.text_contrast_medium,
            ]}>
            {`${graphemeCount} / ${MAX_GRAPHEME_LENGTH}`}
          </Text>
        </View>

        <View style={[a.flex_row, a.justify_end, a.gap_sm]}>
          <Button
            label="Cancel"
            size="small"
            variant="ghost"
            color="secondary"
            disabled={saving}
            onPress={() => control.close()}>
            <ButtonText>
              <Trans>Cancel</Trans>
            </ButtonText>
          </Button>
          <Button
            testID="editAgentPostSaveBtn"
            label={`Save ${agentName}’s post`}
            size="small"
            variant="solid"
            color="primary"
            disabled={!canSave}
            onPress={() => void onSave()}>
            {saving ? <Loader size="sm" /> : null}
            <ButtonText>
              <Trans>Save</Trans>
            </ButtonText>
          </Button>
        </View>
      </View>
      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
