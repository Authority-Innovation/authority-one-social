import {useState} from 'react'
import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {
  type $Typed,
  AppBskyEmbedImages,
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  RichText,
} from '@atproto/api'
import {Trans} from '@lingui/react/macro'
import {countGraphemes} from 'unicode-segmenter/grapheme'

import {type EditPostImage, uploadChatImage} from '#/lib/agent-runtime'
import {IMAGE_SIZE_CONFIG_2K_1MB, MAX_GRAPHEME_LENGTH} from '#/lib/constants'
import {compressIfNeeded} from '#/lib/media/manip'
import {openPicker} from '#/lib/media/picker'
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
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Image_Stroke2_Corner0_Rounded as ImageIcon} from '#/components/icons/Image'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Loader} from '#/components/Loader'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {extractImageBlobCid} from './editAgentPostImages'

/** One image in the edit set: an existing embed image (carries its view for
 *  thumbnails/alt and its blob-ref CID for the wire `keep`) or a just-uploaded
 *  hosted url (renders directly, sent as `{url}`). */
type EditImage = {
  url: string
  view?: AppBskyEmbedImages.ViewImage
  /** Blob-ref $link (CID) of an EXISTING image — what the runtime's `keep`
   *  takes. Absent = a newly added hosted image. */
  keepRef?: string
}

const MAX_EDIT_IMAGES = 4

/**
 * Edit an agent-authored post in place: text (prefilled, facets re-detected
 * client-side) AND the image set — thumbnails of current images with remove
 * controls, plus add-image (<=4 total) via the same /app/media/upload path
 * post-as uses. Saved through the ownership-scoped runtime endpoint (POST
 * /app/agents/posts/edit — same uri, new cid). Direct-manipulation plane:
 * never the session repo, never the agent's LLM.
 *
 * EMBED-TYPE GUARD: image editing is offered only on text-only or images
 * posts. A video/link/quote embed disables the image section with a note
 * (the runtime enforces the same rule with code 'embed-type-conflict').
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

  // EMBED-TYPE GUARD: only a (missing or) plain images embed is image-editable.
  // Video / external link / quote embeds keep their embed untouched — the
  // image section renders disabled with a note instead.
  const existingImagesEmbed = AppBskyEmbedImages.isView(post.embed)
    ? post.embed
    : undefined
  const hasBlockingEmbed = !!post.embed && !existingImagesEmbed

  // Existing images must be sent to the runtime as their blob-ref CIDs
  // (`keep`), resolved from the post record's embed (view order matches the
  // record order), with the fullsize url as fallback.
  const recordImages = AppBskyEmbedImages.isMain(record.embed)
    ? record.embed.images
    : undefined
  const [images, setImages] = useState<EditImage[]>(
    () =>
      existingImagesEmbed?.images.map((img, i) => ({
        url: img.fullsize,
        view: img,
        keepRef: extractImageBlobCid(recordImages?.[i]?.image, img.fullsize),
      })) ?? [],
  )
  const [uploadingImage, setUploadingImage] = useState(false)

  // FAIL CLOSED: if any existing image's blob ref can't be resolved we cannot
  // build a faithful `keep` set — offering edits would silently drop images.
  const unresolvedKeeps =
    !!existingImagesEmbed && images.some(img => img.view && !img.keepRef)
  const imageEditingBlocked = hasBlockingEmbed || unresolvedKeeps

  const initialUrls = existingImagesEmbed?.images.map(img => img.fullsize) ?? []
  const imagesChanged =
    !imageEditingBlocked &&
    (images.length !== initialUrls.length ||
      images.some((img, i) => img.url !== initialUrls[i]))

  const graphemeCount = countGraphemes(text.trim())
  const overLimit = graphemeCount > MAX_GRAPHEME_LENGTH
  const canSave =
    (text.trim().length > 0 || images.length > 0) &&
    !overLimit &&
    !saving &&
    !uploadingImage

  const engagementCount =
    (post.likeCount ?? 0) + (post.repostCount ?? 0) + (post.replyCount ?? 0)

  // ADD IMAGE: pick -> compress under the 1MB PDS blob cap -> host on the
  // runtime (/app/media/upload) -> stage the hosted url. Same path post-as
  // uses; nothing touches the PDS until Save.
  const onAddImage = async () => {
    try {
      const picked = await openPicker({selectionLimit: 1})
      const img = picked?.[0]
      if (!img) return
      setUploadingImage(true)
      const compressed = await compressIfNeeded(img, IMAGE_SIZE_CONFIG_2K_1MB)
      const url = await uploadChatImage({
        uri: compressed.path,
        mime: compressed.mime,
      })
      if (url) {
        setImages(prev =>
          prev.length < MAX_EDIT_IMAGES ? [...prev, {url}] : prev,
        )
      } else {
        Toast.show(`Could not upload the image. Please try again.`, {
          type: 'error',
        })
      }
    } catch {
      // Picker cancelled or compression failed — stay quiet.
    } finally {
      setUploadingImage(false)
    }
  }

  const removeImage = (index: number) =>
    setImages(prev => prev.filter((_, i) => i !== index))

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

      // Images ride only when the set actually changed: the FINAL ordered
      // entries — {keep: blobCid} for existing images (alt omitted so the
      // runtime inherits it), {url} for newly hosted ones; [] clears. The
      // optimistic embed view reuses kept view objects (alt/CDN thumbs
      // survive) and renders hosted urls directly for adds until the AppView
      // catches up.
      let imagePayload = {}
      if (imagesChanged) {
        const optimisticEmbed: $Typed<AppBskyEmbedImages.View> | null =
          images.length === 0
            ? null
            : {
                $type: 'app.bsky.embed.images#view',
                images: images.map(
                  img =>
                    img.view ?? {thumb: img.url, fullsize: img.url, alt: ''},
                ),
              }
        const wireImages: EditPostImage[] = images.map(img =>
          img.keepRef ? {keep: img.keepRef} : {url: img.url},
        )
        imagePayload = {
          images: wireImages,
          optimisticEmbed,
        }
      }

      await editMutation.mutateAsync({
        agent,
        uri: post.uri,
        text: rt.text,
        facets: rt.facets,
        ...imagePayload,
      })
      control.close(() => {
        Toast.show(`Updated ${agentName}’s post`, {type: 'success'})
      })
    } catch (e) {
      logger.error('Failed to edit agent post', {message: e})
      const code = e instanceof AgentPostActionError ? e.code : undefined
      Toast.show(
        code === 'not-your-agent'
          ? `That agent isn’t linked to your account.`
          : code === 'too-long'
            ? `That post is too long.`
            : code === 'embed-type-conflict'
              ? `This post’s attachment type doesn’t allow image changes.`
              : code === 'bad-image' || code === 'image-too-large'
                ? `One of the images can’t be used. Remove it and try again.`
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

        <View style={[a.gap_sm]}>
          <TextField.LabelText>
            <Trans>Images</Trans>
          </TextField.LabelText>

          {imageEditingBlocked ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {hasBlockingEmbed ? (
                <Trans>
                  This post has a video, link or quote attached — images can’t
                  be edited here.
                </Trans>
              ) : (
                <Trans>
                  This post’s existing images couldn’t be read — image editing
                  is unavailable right now.
                </Trans>
              )}
            </Text>
          ) : (
            <>
              {images.length > 0 ? (
                <View style={[a.flex_row, a.flex_wrap, a.gap_md, a.pt_2xs]}>
                  {images.map((img, i) => (
                    <View key={`${img.url}-${i}`}>
                      <Image
                        source={{uri: img.view?.thumb ?? img.url}}
                        style={[a.rounded_sm, {width: 72, height: 72}]}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                        alt={img.view?.alt || 'Post image'}
                      />
                      <Pressable
                        testID={`editAgentPostRemoveImageBtn-${i}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove image ${i + 1}`}
                        accessibilityHint=""
                        onPress={() => removeImage(i)}
                        style={[
                          a.absolute,
                          a.rounded_full,
                          a.align_center,
                          a.justify_center,
                          {
                            top: -6,
                            right: -6,
                            width: 22,
                            height: 22,
                            backgroundColor: t.palette.contrast_700,
                          },
                        ]}>
                        <CloseIcon size="xs" fill={t.palette.contrast_25} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {images.length < MAX_EDIT_IMAGES ? (
                <View style={[a.flex_row]}>
                  <Button
                    testID="editAgentPostAddImageBtn"
                    label="Add image"
                    size="small"
                    variant="solid"
                    color="secondary"
                    disabled={uploadingImage || saving}
                    onPress={() => void onAddImage()}>
                    {uploadingImage ? (
                      <Loader size="sm" />
                    ) : (
                      <ButtonIcon icon={ImageIcon} />
                    )}
                    <ButtonText>
                      <Trans>Add image</Trans>
                    </ButtonText>
                  </Button>
                </View>
              ) : (
                <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                  <Trans>Posts can have up to 4 images.</Trans>
                </Text>
              )}
            </>
          )}
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
