import Svg, {Path, type PathProps, type SvgProps} from 'react-native-svg'

import {WINDMILL_PATH, WINDMILL_VIEWBOX} from '#/lib/windmillPath'
import {usePalette} from '#/lib/hooks/usePalette'

const ratio = 1

// Authority One brand mark — the black ink-brush WINDMILL (shared path).
const WINDMILL = WINDMILL_PATH

/**
 * One brand mark: the windmill, rendered as single-color strokes on a
 * transparent background. Defaults to the theme text color; pass `fill`
 * to override.
 */
export function Logomark({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  // @ts-ignore it's fiiiiine
  const size = parseInt(rest.width || 32)

  return (
    <Svg
      fill="none"
      viewBox={WINDMILL_VIEWBOX}
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <Path d={WINDMILL} fill={fill || pal.text.color} />
    </Svg>
  )
}
