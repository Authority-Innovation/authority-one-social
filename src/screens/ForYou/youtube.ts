/**
 * Helpers for the in-app YouTube IFrame Player API (used by YouTubePlayer). Kept
 * pure so the player-vars config + error handling are unit-testable.
 *
 * ERROR 153 / 101 / 150 fix: the player must be created via the IFrame API inside
 * an HTML document served from a real `https://www.youtube.com` origin (WebView
 * `baseUrl`), with `enablejsapi`, `playsinline`, `origin`, and `rel:0`. Loading
 * `youtube.com/embed/<id>` directly as a WebView URL (the old approach) produced
 * 153 because the embed had no valid referrer/origin.
 */

export const YOUTUBE_ORIGIN = 'https://www.youtube.com'

export interface PlayerVars {
  autoplay: 0 | 1
  mute: 0 | 1
  playsinline: 1
  rel: 0
  modestbranding: 1
  enablejsapi: 1
  origin: string
}

export function buildPlayerVars(autoplay: boolean): PlayerVars {
  return {
    autoplay: autoplay ? 1 : 0,
    mute: 1,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,
    origin: YOUTUBE_ORIGIN,
  }
}

/**
 * IFrame API error codes that mean "this video can't be embedded here" (invalid id
 * / embedding disabled by the owner) — the UI shows a fallback "Watch on YouTube"
 * card for these.
 */
export function isEmbeddableError(code: number): boolean {
  return code === 2 || code === 5 || code === 100 || code === 101 || code === 150
}

export type PlayerMessage =
  | {type: 'ready'}
  | {type: 'state'; state: number}
  | {type: 'time'; position: number; duration: number}
  | {type: 'ended'}
  | {type: 'error'; code: number}

/** Parse a postMessage payload from the player WebView. Returns null if invalid. */
export function parsePlayerMessage(raw: unknown): PlayerMessage | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  switch (d.type) {
    case 'ready':
      return {type: 'ready'}
    case 'ended':
      return {type: 'ended'}
    case 'state':
      return typeof d.state === 'number' ? {type: 'state', state: d.state} : null
    case 'time':
      return typeof d.position === 'number' && typeof d.duration === 'number'
        ? {type: 'time', position: d.position, duration: d.duration}
        : null
    case 'error':
      return typeof d.code === 'number' ? {type: 'error', code: d.code} : null
    default:
      return null
  }
}

/**
 * HTML document for the IFrame Player API WebView. Served with
 * `baseUrl: YOUTUBE_ORIGIN` so the `origin` player var matches the document origin.
 */
export function youtubePlayerHtml(videoId: string, autoplay: boolean): string {
  const vars = buildPlayerVars(autoplay)
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>html,body{margin:0;background:#000;height:100%;overflow:hidden}#player{width:100%;height:100%}</style>
</head><body>
<div id="player"></div>
<script>
var RN = window.ReactNativeWebView;
function post(o){ if (RN) RN.postMessage(JSON.stringify(o)); }
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.body.appendChild(tag);
var player, timer;
function onYouTubeIframeAPIReady(){
  player = new YT.Player('player', {
    videoId: ${JSON.stringify(videoId)},
    playerVars: ${JSON.stringify(vars)},
    events: {
      onReady: function(){ post({type:'ready'}); },
      onStateChange: function(e){
        post({type:'state', state: e.data});
        if (e.data === YT.PlayerState.ENDED) post({type:'ended'});
        if (e.data === YT.PlayerState.PLAYING) {
          clearInterval(timer);
          timer = setInterval(function(){
            try { post({type:'time', position: player.getCurrentTime(), duration: player.getDuration()}); } catch(err){}
          }, 1000);
        } else { clearInterval(timer); }
      },
      onError: function(e){ post({type:'error', code: e.data}); }
    }
  });
}
window.__play = function(){ try{ player && player.playVideo(); }catch(e){} };
window.__pause = function(){ try{ player && player.pauseVideo(); }catch(e){} };
</script></body></html>`
}
