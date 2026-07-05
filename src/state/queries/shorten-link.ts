// Was a POST to Bluesky's link shortener (https://go.bsky.app/link), which
// would hand users a go.bsky.app URL. We have no shortener service, so this
// returns the input unchanged; callers already treat the result as
// best-effort and fall back to the full URL.
export function useShortenLink() {
  return (inputUrl: string): Promise<{url: string}> => {
    return Promise.resolve({url: inputUrl})
  }
}
