import Svg, {
  G,
  Path,
  type PathProps,
  type SvgProps,
  Text as SvgText,
} from 'react-native-svg'

import {WINDMILL_PATH} from '#/lib/windmillPath'
import {useTheme} from '#/alf'

const ratio = 17 / 64

// Windmill mark scaled into a 30x30 slot (factor 30/64 of the 64 grid).
const WINDMILL_SCALE = 30 / 64

/**
 * One brand: the windmill mark + "One" wordmark. Single-color strokes on a
 * transparent background.
 */
export function LogomarkWithType({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const t = useTheme()
  const size = parseInt(`${rest.width || 32}`)

  return (
    <Svg
      fill="none"
      viewBox="0 0 136 31"
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <G transform={`scale(${WINDMILL_SCALE})`}>
        <Path d={WINDMILL_PATH} fill={fill || t.palette.primary_500} />
      </G>
      <SvgText
        // @ts-ignore react-native-svg fill type is fine with strings
        fill={fill || t.atoms.text.color}
        x="38"
        y="23"
        fontSize="20"
        fontWeight="800"
        fontFamily="-apple-system, system-ui, sans-serif"
        letterSpacing="0.5">
        One
      </SvgText>
    </Svg>
  )
}
