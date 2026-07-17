import {useState} from 'react'
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  View,
} from 'react-native'
import {Image} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'

import {type AgentAsset, provenanceSummary} from '#/lib/agent-runtime'
import {
  AgentAssetsError,
  anyUntrustedCaptions,
  type AssetGalleryFilters,
  type AssetTimeFilter,
  flattenAssetPages,
  useAgentAssetsQuery,
} from '#/state/queries/agent-assets'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Image_Stroke2_Corner0_Rounded as ImageIcon} from '#/components/icons/Image'
import {PageText_Stroke2_Corner0_Rounded as DocIcon} from '#/components/icons/PageText'
import {Play_Stroke2_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import {Warning_Stroke2_Corner0_Rounded as WarningIcon} from '#/components/icons/Warning'
import {Text} from '#/components/Typography'

/**
 * The Gallery tab (owner-only): a scrollable "camera roll" of everything this
 * agent has SEEN across its conversations - images, video, and documents shared
 * into WhatsApp/SMS/app threads - browsable newest-first with type and time
 * filters. Reads the owner-scoped asset ledger
 * (GET /app/agents/:agent/assets), infinite-scrolling by the runtime's opaque
 * cursor.
 *
 * SECURITY: captions and provenance (sender / conversation title / filename) are
 * THIRD-PARTY-AUTHORED (WhatsApp group members, image OCR). They are rendered
 * ONLY inside React Native <Text>, which displays its children as inert text -
 * there is no markup/HTML interpretation and no injection path. An OCR'd image
 * that contains "SYSTEM: do X" renders as the literal characters, never as a
 * command. The larger-view dialog flags captions as auto-detected + untrusted.
 */

type TypeFilter = 'all' | 'image' | 'video' | 'document'

const TILE_TARGET = 130 // px; column count derives from the measured width.

export function AssetGalleryTab({
  agentHandle,
  displayName,
}: {
  agentHandle: string
  displayName: string
}) {
  const t = useTheme()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [time, setTime] = useState<AssetTimeFilter>('all')
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<AgentAsset | null>(null)
  const detailControl = Dialog.useDialogControl()

  const filters: AssetGalleryFilters = {
    type: typeFilter === 'all' ? undefined : typeFilter,
    time,
  }
  const query = useAgentAssetsQuery(agentHandle, filters)
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = query

  const assets = flattenAssetPages(data?.pages)
  const untrusted = anyUntrustedCaptions(data?.pages)
  const notOwned =
    isError &&
    error instanceof AgentAssetsError &&
    error.code === 'not-your-agent'
  const cols =
    width > 0 ? Math.min(5, Math.max(2, Math.floor(width / TILE_TARGET))) : 3

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w && Math.abs(w - width) > 1) setWidth(w)
  }

  const openAsset = (asset: AgentAsset) => {
    setSelected(asset)
    detailControl.open()
  }

  return (
    <View style={[a.flex_1]} onLayout={onLayout}>
      <FilterBar
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        time={time}
        onTime={setTime}
      />

      {isLoading ? (
        <View style={[a.flex_1, a.align_center, a.justify_center, a.py_2xl]}>
          <ActivityIndicator />
        </View>
      ) : notOwned ? (
        <GalleryNote
          title="This gallery isn’t available"
          body="This agent isn’t linked to your account, so its gallery is private."
        />
      ) : isError ? (
        <GalleryNote
          title="Gallery is unavailable right now"
          body="We couldn’t reach the agent runtime. Pull to retry in a moment."
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      ) : assets.length === 0 ? (
        <EmptyGallery
          displayName={displayName}
          filtered={typeFilter !== 'all' || time !== 'all'}
        />
      ) : (
        <FlatList
          key={cols}
          data={assets}
          keyExtractor={(item, index) => `${item.ref}:${index}`}
          numColumns={cols}
          renderItem={({item}) => (
            <AssetTile
              asset={item}
              size={width > 0 ? width / cols : TILE_TARGET}
              onPress={() => openAsset(item)}
            />
          )}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
          }}
          onEndReachedThreshold={0.6}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          contentContainerStyle={[a.pb_4xl]}
          ListFooterComponent={
            <View style={[a.py_lg, a.align_center]}>
              {isFetchingNextPage ? (
                <ActivityIndicator />
              ) : hasNextPage ? (
                <Button
                  label="Load more"
                  size="small"
                  variant="solid"
                  color="secondary"
                  onPress={() => void fetchNextPage()}>
                  <ButtonText>
                    <Trans>Load more</Trans>
                  </ButtonText>
                </Button>
              ) : (
                <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                  <Trans>That’s everything so far.</Trans>
                </Text>
              )}
            </View>
          }
        />
      )}

      <Dialog.Outer control={detailControl}>
        <Dialog.Handle />
        {selected ? (
          <AssetDetail asset={selected} untrusted={untrusted} />
        ) : null}
      </Dialog.Outer>
    </View>
  )
}

// -- Filter bar --------------------------------------------------------------

function FilterBar({
  typeFilter,
  onTypeFilter,
  time,
  onTime,
}: {
  typeFilter: TypeFilter
  onTypeFilter: (t: TypeFilter) => void
  time: AssetTimeFilter
  onTime: (t: AssetTimeFilter) => void
}) {
  const {t: l} = useLingui()
  const t = useTheme()
  const typeOptions: {key: TypeFilter; label: string}[] = [
    {key: 'all', label: l`All`},
    {key: 'image', label: l`Images`},
    {key: 'video', label: l`Video`},
    {key: 'document', label: l`Docs`},
  ]
  const timeOptions: {key: AssetTimeFilter; label: string}[] = [
    {key: 'today', label: l`Today`},
    {key: 'week', label: l`This week`},
    {key: 'month', label: l`This month`},
    {key: 'all', label: l`All time`},
  ]
  return (
    <View
      style={[
        a.gap_xs,
        a.px_md,
        a.py_sm,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
        {typeOptions.map(o => (
          <Chip
            key={o.key}
            label={o.label}
            active={o.key === typeFilter}
            onPress={() => onTypeFilter(o.key)}
          />
        ))}
      </View>
      <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
        {timeOptions.map(o => (
          <Chip
            key={o.key}
            label={o.label}
            active={o.key === time}
            onPress={() => onTime(o.key)}
            subtle
          />
        ))}
      </View>
    </View>
  )
}

function Chip({
  label,
  active,
  onPress,
  subtle = false,
}: {
  label: string
  active: boolean
  onPress: () => void
  subtle?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{selected: active}}
      onPress={onPress}
      style={[
        a.rounded_full,
        a.px_md,
        a.py_xs,
        active
          ? {backgroundColor: t.palette.primary_500}
          : t.atoms.bg_contrast_25,
      ]}>
      <Text
        style={[
          subtle ? a.text_xs : a.text_sm,
          active ? a.font_bold : undefined,
          active ? {color: t.palette.white} : t.atoms.text_contrast_medium,
        ]}>
        {label}
      </Text>
    </Pressable>
  )
}

// -- Tiles -------------------------------------------------------------------

function AssetTile({
  asset,
  size,
  onPress,
}: {
  asset: AgentAsset
  size: number
  onPress: () => void
}) {
  const t = useTheme()
  const isImage = asset.type === 'image' && !!asset.thumbnail
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${asset.type}`}
      accessibilityHint="Shows a larger view with details"
      onPress={onPress}
      style={{width: size, height: size, padding: 2}}>
      <View
        style={[
          a.flex_1,
          a.rounded_sm,
          a.overflow_hidden,
          a.align_center,
          a.justify_center,
          t.atoms.bg_contrast_25,
        ]}>
        {isImage ? (
          <Image
            source={{uri: asset.thumbnail ?? asset.url}}
            style={{width: '100%', height: '100%'}}
            contentFit="cover"
            transition={120}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <PlaceholderTile type={asset.type} />
        )}
        {asset.type === 'video' ? (
          <View
            style={[
              a.absolute,
              a.rounded_full,
              a.align_center,
              a.justify_center,
              {
                width: 34,
                height: 34,
                backgroundColor: 'rgba(0,0,0,0.45)',
              },
            ]}>
            <PlayIcon size="sm" fill="#fff" />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

function PlaceholderTile({type}: {type: AgentAsset['type']}) {
  const t = useTheme()
  const Icon = type === 'video' ? PlayIcon : DocIcon
  const label = type === 'video' ? 'Video' : 'Document'
  return (
    <View
      style={[a.flex_1, a.align_center, a.justify_center, a.gap_xs, a.p_sm]}>
      <Icon size="lg" fill={t.atoms.text_contrast_medium.color} />
      <Text style={[a.text_2xs, t.atoms.text_contrast_low]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

// -- Detail dialog -----------------------------------------------------------

function AssetDetail({
  asset,
  untrusted,
}: {
  asset: AgentAsset
  untrusted: boolean
}) {
  const {t: l, i18n} = useLingui()
  const t = useTheme()
  const isImage = asset.type === 'image'
  const source = provenanceSummary(asset.provenance)
  const when = asset.at ? new Date(asset.at) : null
  const whenLabel =
    when && !isNaN(when.getTime())
      ? i18n.date(when, {dateStyle: 'medium', timeStyle: 'short'})
      : null

  return (
    <Dialog.ScrollableInner label={l`Asset details`}>
      {isImage ? (
        <Image
          source={{uri: asset.url}}
          style={[a.rounded_md, {width: '100%', aspectRatio: 1}]}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            a.rounded_md,
            a.align_center,
            a.justify_center,
            a.gap_sm,
            {height: 200},
            t.atoms.bg_contrast_25,
          ]}>
          {asset.type === 'video' ? (
            <PlayIcon size="xl" fill={t.atoms.text_contrast_medium.color} />
          ) : (
            <DocIcon size="xl" fill={t.atoms.text_contrast_medium.color} />
          )}
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {asset.type === 'video' ? (
              <Trans>Video</Trans>
            ) : (
              <Trans>Document</Trans>
            )}
          </Text>
        </View>
      )}

      <View style={[a.gap_sm, a.pt_lg]}>
        <DetailRow label={l`Type`}>
          <TypeBadge type={asset.type} />
        </DetailRow>
        {whenLabel ? (
          <DetailRow label={l`Seen`}>
            <Text style={[a.text_sm, t.atoms.text]}>{whenLabel}</Text>
          </DetailRow>
        ) : null}
        {source ? (
          <DetailRow label={l`Shared by`}>
            {/* UNTRUSTED third-party text - inert <Text> only, with emoji. */}
            <Text emoji style={[a.text_sm, a.flex_1, t.atoms.text]}>
              {source}
            </Text>
          </DetailRow>
        ) : null}
        {asset.provenance.conversationTitle ? (
          <DetailRow label={l`Conversation`}>
            {/* UNTRUSTED third-party text - inert <Text> only, with emoji. */}
            <Text emoji style={[a.text_sm, a.flex_1, t.atoms.text]}>
              {asset.provenance.conversationTitle}
            </Text>
          </DetailRow>
        ) : null}

        {asset.caption ? (
          <View style={[a.gap_xs, a.pt_sm]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <WarningIcon size="xs" fill={t.atoms.text_contrast_low.color} />
              <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                {untrusted ? (
                  <Trans>Auto-detected text — may be inaccurate</Trans>
                ) : (
                  <Trans>Detected text</Trans>
                )}
              </Text>
            </View>
            <View style={[a.rounded_sm, a.p_sm, t.atoms.bg_contrast_25]}>
              {/* UNTRUSTED OCR/caption - rendered as inert <Text> only. */}
              <Text emoji style={[a.text_sm, t.atoms.text_contrast_high]}>
                {asset.caption}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.gap_md, a.align_center]}>
      <Text style={[a.text_sm, {width: 96}, t.atoms.text_contrast_medium]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

function TypeBadge({type}: {type: AgentAsset['type']}) {
  const t = useTheme()
  const Icon =
    type === 'image' ? ImageIcon : type === 'video' ? PlayIcon : DocIcon
  const label =
    type === 'image' ? 'Image' : type === 'video' ? 'Video' : 'Document'
  return (
    <View style={[a.flex_row, a.align_center, a.gap_xs]}>
      <Icon size="sm" fill={t.atoms.text_contrast_medium.color} />
      <Text style={[a.text_sm, t.atoms.text]}>{label}</Text>
    </View>
  )
}

// -- Notes / empty state -----------------------------------------------------

function GalleryNote({
  title,
  body,
  onRetry,
  retrying,
}: {
  title: string
  body: string
  onRetry?: () => void
  retrying?: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[a.flex_1, a.align_center, a.justify_center, a.px_xl, a.gap_sm]}>
      <Text style={[a.text_md, a.font_bold, a.text_center, t.atoms.text]}>
        {title}
      </Text>
      <Text style={[a.text_sm, a.text_center, t.atoms.text_contrast_medium]}>
        {body}
      </Text>
      {onRetry ? (
        <Button
          label="Retry"
          size="small"
          variant="solid"
          color="secondary"
          disabled={retrying}
          onPress={onRetry}
          style={[a.mt_sm]}>
          <ButtonText>
            <Trans>Retry</Trans>
          </ButtonText>
        </Button>
      ) : null}
    </View>
  )
}

function EmptyGallery({
  displayName,
  filtered,
}: {
  displayName: string
  filtered: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[a.flex_1, a.align_center, a.justify_center, a.px_xl, a.gap_sm]}>
      <View
        style={[
          a.rounded_full,
          a.align_center,
          a.justify_center,
          {width: 64, height: 64},
          t.atoms.bg_contrast_25,
        ]}>
        <ImageIcon size="xl" fill={t.atoms.text_contrast_medium.color} />
      </View>
      <Text style={[a.text_md, a.font_bold, a.text_center, t.atoms.text]}>
        {filtered ? (
          <Trans>Nothing matches these filters</Trans>
        ) : (
          <Trans>No media yet</Trans>
        )}
      </Text>
      <Text style={[a.text_sm, a.text_center, t.atoms.text_contrast_medium]}>
        {filtered ? (
          <Trans>Try a wider time range or a different type.</Trans>
        ) : (
          // Plain literal: interpolated custom strings render raw ICU
          // placeholders under the uncompiled catalog.
          `Photos, video, and documents shared with ${displayName} will show up here. This may take a moment to fill in.`
        )}
      </Text>
    </View>
  )
}
