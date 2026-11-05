/**
 * Hard checks every clickthrough step asserts, plus the door shape check.
 * Pure: they take text and JSON and return a list of failure strings (empty
 * means the check passed), so the jest tests can hold them against fixtures.
 */
const path = require('path')

/* ---------- visible-text checks ---------- */

/** A literal "{" or "}" in visible text: an unfilled placeholder (build 40). */
function checkNoBraces(text) {
  const m = /[{}]/.exec(String(text))
  if (!m) return []
  const at = m.index
  const snippet = String(text)
    .slice(Math.max(0, at - 30), at + 30)
    .replace(/\s+/g, ' ')
  return [`literal "${m[0]}" in visible text: "...${snippet}..."`]
}

function checkNoUnavailable(text) {
  return /isn['’]t available yet/i.test(String(text))
    ? ['"isn\'t available yet" text is on screen']
    : []
}

// Red screen, error boundary and crash wording seen in this app and in RN/Expo
// web overlays.
const CRASH_PATTERNS = [
  /something went wrong/i,
  /an unexpected error/i,
  /oops!? .*error/i,
  /uncaught (?:error|exception)/i,
  /unhandled (?:error|promise|rejection)/i,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError):/,
  /cannot read propert(?:y|ies) of/i,
  /is not a function/i,
  /render error/i,
  /error boundary/i,
  /the app crashed/i,
]

function checkNoCrashText(text) {
  const out = []
  for (const re of CRASH_PATTERNS) {
    if (re.test(String(text))) out.push(`crash/error text on screen (${re})`)
  }
  return out
}

/* ---------- display-name checks ---------- */

// A handle-ish token: dotted labels ending in a 2+ letter TLD, optionally
// "@"-prefixed, or a DID.
const HANDLE_RE =
  /(?:^|[\s(@])@?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?=$|[\s),.!?:;])/i
const DID_RE = /\bdid:(?:plc|web):[a-z0-9._:%-]+/i

/**
 * The raw handle or DID in `text`, if there is one.
 * @param {string} text
 * @param {string[]} [knownHandles]
 */
function findRawHandle(text, knownHandles = []) {
  const s = String(text)
  for (const h of knownHandles) {
    if (h && s.toLowerCase().includes(String(h).toLowerCase())) return h
  }
  const did = DID_RE.exec(s)
  if (did) return did[0]
  const m = HANDLE_RE.exec(s)
  return m ? m[1] : null
}

/**
 * @param {{slot: string, text: string}[]} slots Texts of the elements where a
 *   display name is expected (sponsor line, post author, roster name).
 * @param {string[]} [knownHandles]
 */
function checkNoRawHandles(slots, knownHandles = []) {
  const out = []
  for (const {slot, text} of slots) {
    const found = findRawHandle(text, knownHandles)
    if (found) {
      out.push(
        `raw handle "${found}" where a display name is expected (${slot})`,
      )
    }
  }
  return out
}

/* ---------- console ---------- */

function checkNoConsoleErrors(errors) {
  return errors.map(e => `console ${e.kind}: ${e.text}`)
}

/**
 * Every visible-text, name-slot and console check in one call.
 * @param {{text?: string, nameSlots?: {slot: string, text: string}[], consoleErrors?: {kind: string, text: string}[], knownHandles?: string[]}} input
 */
function runHardChecks({
  text = '',
  nameSlots = [],
  consoleErrors = [],
  knownHandles = [],
}) {
  return [
    ...checkNoBraces(text),
    ...checkNoUnavailable(text),
    ...checkNoCrashText(text),
    ...checkNoRawHandles(nameSlots, knownHandles),
    ...checkNoConsoleErrors(consoleErrors),
  ]
}

/* ---------- door response shapes ---------- */

const DOOR_FIXTURE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'lib',
  'communities',
  '__fixtures__',
  'door',
  'door.json',
)

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Infers a shape from one or more samples: the types each value takes, the
 * keys of objects (required = present in every sample) and the merged shape
 * of array elements.
 */
function inferShape(samples) {
  const shape = {types: new Set(), keys: null, element: null}
  const objects = []
  const elements = []
  for (const s of samples) {
    shape.types.add(typeOf(s))
    if (typeOf(s) === 'object') objects.push(s)
    if (Array.isArray(s)) elements.push(...s)
  }
  if (objects.length) {
    const all = new Set()
    for (const o of objects) for (const k of Object.keys(o)) all.add(k)
    shape.keys = {}
    for (const k of all) {
      const present = objects.filter(o =>
        Object.prototype.hasOwnProperty.call(o, k),
      )
      shape.keys[k] = {
        required: present.length === objects.length,
        shape: inferShape(present.map(o => o[k])),
      }
    }
  }
  if (elements.length) shape.element = inferShape(elements)
  return shape
}

/**
 * Compares a real response against a fixture shape. Unknown keys, missing
 * required keys and type changes fail. A value the fixtures only ever show
 * as null may be any scalar (the fixture cannot say which).
 */
function checkShape(actual, shape, at = '$') {
  const out = []
  const t = typeOf(actual)
  const types = shape.types
  const onlyNull = types.size === 1 && types.has('null')
  const typeOk = types.has(t) || (onlyNull && t !== 'object' && t !== 'array')
  if (!typeOk) {
    out.push(`${at}: expected ${[...types].join('|')}, got ${t}`)
    return out
  }
  if (t === 'object' && shape.keys) {
    for (const k of Object.keys(actual)) {
      if (!shape.keys[k]) out.push(`${at}.${k}: key not in the door fixtures`)
    }
    for (const [k, spec] of Object.entries(shape.keys)) {
      if (!Object.prototype.hasOwnProperty.call(actual, k)) {
        if (spec.required) out.push(`${at}.${k}: missing`)
        continue
      }
      out.push(...checkShape(actual[k], spec.shape, `${at}.${k}`))
    }
  }
  if (t === 'array' && shape.element) {
    actual.forEach((el, i) =>
      out.push(...checkShape(el, shape.element, `${at}[${i}]`)),
    )
  }
  return out
}

/** Shapes for the routes the clickthrough asserts, from the door fixtures. */
function doorShapes(door = require(DOOR_FIXTURE)) {
  // Every item the fixtures hold, so agent-only keys (sources, no_source) are
  // known item keys.
  const items = [
    ...door.timeline.items,
    door.post.item,
    door.reply.item,
    ...door.export.items,
  ]
  return {
    timeline: inferShape([
      door.timeline,
      ...items.map(i => ({items: [i], cursor: door.timeline.cursor})),
    ]),
    roster: inferShape([door.roster]),
  }
}

/** Which door route a runtime URL is, for the shape check. */
function doorRouteOf(url) {
  let p
  try {
    p = new URL(url).pathname
  } catch {
    return null
  }
  if (/^\/app\/communities\/[^/]+\/timeline\/?$/.test(p)) return 'timeline'
  if (/^\/app\/communities\/[^/]+\/posts\/[^/]+\/roster\/?$/.test(p))
    return 'roster'
  return null
}

module.exports = {
  checkNoBraces,
  checkNoUnavailable,
  checkNoCrashText,
  findRawHandle,
  checkNoRawHandles,
  checkNoConsoleErrors,
  runHardChecks,
  inferShape,
  checkShape,
  doorShapes,
  doorRouteOf,
  DOOR_FIXTURE,
}
