import {
  type IsValidHandle,
  slugifyHandlePart,
  validateServiceHandle,
} from '#/lib/strings/handles'

describe('handle validation', () => {
  const valid = [
    ['ali', 'bsky.social'],
    ['alice', 'bsky.social'],
    ['a-lice', 'bsky.social'],
    ['a-----lice', 'bsky.social'],
    ['123', 'bsky.social'],
    ['123456789012345678', 'bsky.social'],
    ['alice', 'custom-pds.com'],
    ['alice', 'my-custom-pds-with-long-name.social'],
    ['123456789012345678', 'my-custom-pds-with-long-name.social'],
  ]
  it.each(valid)(`should be valid: %s.%s`, (handle, service) => {
    const result = validateServiceHandle(handle, service)
    expect(result.overall).toEqual(true)
  })

  const invalid = [
    ['al', 'bsky.social', 'frontLengthNotTooShort'],
    ['-alice', 'bsky.social', 'hyphenStartOrEnd'],
    ['alice-', 'bsky.social', 'hyphenStartOrEnd'],
    ['%%%', 'bsky.social', 'handleChars'],
    ['1234567890123456789', 'bsky.social', 'frontLengthNotTooLong'],
    [
      '1234567890123456789',
      'my-custom-pds-with-long-name.social',
      'frontLengthNotTooLong',
    ],
    ['al', 'my-custom-pds-with-long-name.social', 'frontLengthNotTooShort'],
    ['a'.repeat(300), 'toolong.com', 'totalLength'],
  ] satisfies [string, string, keyof IsValidHandle][]
  it.each(invalid)(
    `should be invalid: %s.%s due to %s`,
    (handle, service, expectedError) => {
      const result = validateServiceHandle(handle, service)
      expect(result.overall).toEqual(false)
      expect(result[expectedError]).toEqual(false)
    },
  )
})

describe('slugifyHandlePart', () => {
  const cases: [string, string][] = [
    ['Ron Pickles', 'ron-pickles'],
    ['  a__b  ', 'a-b'],
    ['Cafe Noir', 'cafe-noir'],
    ['Café', 'cafe'],
    ['a--  --b', 'a-b'],
    ['-lead-and-trail-', 'lead-and-trail'],
    ["ron's pickles!", 'rons-pickles'],
    ['ada', 'ada'],
    ['!!!', ''],
    ['   ', ''],
    ['', ''],
  ]
  it.each(cases)('slugifies %j to %j', (input, expected) => {
    expect(slugifyHandlePart(input)).toEqual(expected)
  })
})
