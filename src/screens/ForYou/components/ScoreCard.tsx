import {View} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'

import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'
import {useForYouInsets} from '../insets'
import {type FeedItem, type FeedScore} from '../types'
import {SourceChip} from './ItemFooter'

/**
 * Designed full-frame score card: team-color background, big centered score, team
 * labels + game state. Replaces the dead-space text card for NHL/MLB game items.
 */
export function ScoreCard({item, score}: {item: FeedItem; score: FeedScore}) {
  const {bottom} = useForYouInsets()
  const accent = score.accentColor ?? '#1a1a1a'
  const hasScore =
    typeof score.homeScore === 'number' && typeof score.awayScore === 'number'

  return (
    <LinearGradient
      colors={[accent, '#0b0b0b']}
      start={{x: 0, y: 0}}
      end={{x: 0, y: 1}}
      style={[a.flex_1]}>
      <View style={[a.flex_1, a.align_center, a.justify_center, a.px_xl, a.gap_xl]}>
        {score.state ? (
          <View
            style={[
              a.rounded_full,
              a.px_md,
              a.py_xs,
              {backgroundColor: 'rgba(255,255,255,0.18)'},
            ]}>
            <Text style={[a.text_sm, a.font_bold, {color: '#fff', letterSpacing: 1}]}>
              {score.state.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {hasScore ? (
          <View style={[a.flex_row, a.align_center, a.justify_center, a.gap_lg]}>
            <TeamColumn name={score.away} value={score.awayScore} />
            <Text style={[a.font_bold, {color: 'rgba(255,255,255,0.5)', fontSize: 40}]}>
              –
            </Text>
            <TeamColumn name={score.home} value={score.homeScore} />
          </View>
        ) : (
          <View style={[a.align_center, a.gap_xs]}>
            <Text
              emoji
              style={[a.text_4xl, a.font_bold, a.text_center, {color: '#fff'}]}>
              {score.away}
            </Text>
            <Text style={[a.text_lg, {color: 'rgba(255,255,255,0.6)'}]}>at</Text>
            <Text
              emoji
              style={[a.text_4xl, a.font_bold, a.text_center, {color: '#fff'}]}>
              {score.home}
            </Text>
          </View>
        )}
      </View>

      <View
        style={[a.absolute, a.w_full, a.px_xl, a.gap_xs, {left: 0, right: 0, bottom}]}>
        <SourceChip item={item} />
        {item.summary ? (
          <Text
            emoji
            numberOfLines={2}
            style={[a.text_sm, a.leading_snug, {color: 'rgba(255,255,255,0.85)'}]}>
            {item.summary}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  )
}

function TeamColumn({name, value}: {name: string; value?: number}) {
  return (
    <View style={[a.align_center, a.gap_xs, {maxWidth: 130}]}>
      <Text style={[a.font_bold, {color: '#fff', fontSize: 64, lineHeight: 64}]}>
        {value ?? 0}
      </Text>
      <Text
        emoji
        numberOfLines={2}
        style={[a.text_md, a.font_bold, a.text_center, {color: 'rgba(255,255,255,0.9)'}]}>
        {name}
      </Text>
    </View>
  )
}
