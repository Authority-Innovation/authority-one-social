import {forwardRef} from 'react'
import {type TextProps} from 'react-native'
import Svg, {Path, type PathProps, type SvgProps} from 'react-native-svg'

import {WINDMILL_PATH, WINDMILL_VIEWBOX} from '#/lib/windmillPath'
import {flatten, useTheme} from '#/alf'

const ratio = 1

// Authority One brand mark — the black ink-brush WINDMILL (shared path).
const WINDMILL = WINDMILL_PATH

type Props = {
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

/**
 * One brand mark: the windmill, rendered as single-color strokes on a
 * transparent background so it sits on any surface (nav, headers, loading).
 * Defaults to the brand accent; pass `fill` to override.
 */
export const Logo = forwardRef(function LogoImpl(props: Props, ref) {
  const t = useTheme()
  const {fill, ...rest} = props
  const styles = flatten(props.style)
  const _fill =
    fill === 'sky'
      ? t.palette.primary_500
      : fill || styles?.color || t.palette.primary_500
  // @ts-ignore it's fiiiiine
  const size = parseInt(rest.width || 32, 10)

  return (
    <Svg
      fill="none"
      // @ts-ignore it's fiiiiine
      ref={ref}
      viewBox={WINDMILL_VIEWBOX}
      accessibilityLabel="One"
      accessibilityHint=""
      {...rest}
      style={[{width: size, height: size * ratio}, styles]}>
      <Path d={WINDMILL} fill={_fill} />
    </Svg>
  )
})
