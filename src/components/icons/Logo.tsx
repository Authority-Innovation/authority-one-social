import Svg, {Path, Text as SvgText} from 'react-native-svg'

import {WINDMILL_PATH, WINDMILL_VIEWBOX} from '#/lib/windmillPath'
import {type Props, useCommonSVGProps} from './common'
import {createSinglePathSVG} from './TEMPLATE'

// Authority One brand mark: the black ink-brush WINDMILL (single-color; takes
// the icon `fill`). Replaces the Bluesky butterfly / the interim varsity "1".
// Authored on a 64×64 grid; shared from src/lib/windmillPath so both this mark
// and src/view/icons/Logo.tsx stay identical.
const ONE_NUMERAL = WINDMILL_PATH

export const Mark = createSinglePathSVG({
  path: ONE_NUMERAL,
  viewBox: WINDMILL_VIEWBOX,
})

/**
 * Authority One wordmark lockup: the windmill mark followed by the "One"
 * wordmark. Replaces the Bluesky butterfly + "bluesky" wordmark.
 */
export function Full(
  props: Omit<Props, 'fill' | 'size' | 'height'> & {
    markFill?: Props['fill']
    textFill?: Props['fill']
  },
) {
  const {fill, size, style, ...rest} = useCommonSVGProps(props)
  const ratio = 64 / 200

  return (
    <Svg
      fill="none"
      {...rest}
      viewBox="0 0 200 64"
      width={size}
      height={size * ratio}
      style={[style]}>
      <Path d={ONE_NUMERAL} fill={props.markFill ?? fill} />
      <SvgText
        // @ts-ignore react-native-svg fill type accepts strings
        fill={props.textFill ?? fill}
        x="74"
        y="48"
        fontSize="48"
        fontWeight="800"
        fontFamily="-apple-system, system-ui, sans-serif"
        letterSpacing="1">
        One
      </SvgText>
    </Svg>
  )
}
