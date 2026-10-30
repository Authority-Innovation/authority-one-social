/**
 * The clickthrough flow. Run by run.js (`pnpm e2e:clickthrough`), which has
 * already passed the Dev guard and found a devtest credential.
 *
 * Steps run in order. An action that fails stops the flow (later steps are
 * recorded as not run); a hard-check failure fails its step and the flow goes
 * on, so one run reports as much as it can. Any failure fails the run.
 */
import {type Browser, type Page, test} from '@playwright/test'

import * as checks from './lib/checks'
import * as credsLib from './lib/creds'
import * as reportLib from './lib/report'

const COMMUNITY_ID = 'ao-dev-test'
const runId = process.env.CLICKTHROUGH_RUN_ID || reportLib.newRunId()
const runtimeOrigin = new URL(
  process.env.CLICKTHROUGH_RUNTIME_URL ||
    'https://authority-one-agent-runtime-dev.e-479.workers.dev',
).origin

const creds = credsLib.loadCredentials()
const secrets: string[] = credsLib.secretsOf(creds)
const knownHandles: string[] = [creds.devtest?.handle, creds.admin?.handle]
  .filter((h): h is string => !!h)
  .map(h => h.replace(/^@/, ''))
const shapes = checks.doorShapes()

type StepStatus = 'pass' | 'fail' | 'skipped' | 'already-member' | 'not run'
type StepResult = {
  step: string
  status: StepStatus
  reason: string
  timestamp: string
  screenshot: string | null
}
type ConsoleError = {step: string; kind: string; text: string}

const steps: StepResult[] = []
const consoleErrors: ConsoleError[] = []
const notes: string[] = []
const seenRoutes = {timeline: 0, roster: 0}
let currentStep = 'signin'
let pendingConsole: ConsoleError[] = []
let pendingShape: string[] = []

class StopFlow extends Error {}

function tid(id: string) {
  return `[data-testid="${id}"]`
}

function watch(page: Page) {
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const e = {
      step: currentStep,
      kind: 'console.error',
      text: credsLib.redact(msg.text(), secrets).slice(0, 500),
    }
    consoleErrors.push(e)
    pendingConsole.push(e)
  })
  page.on('pageerror', err => {
    const e = {
      step: currentStep,
      kind: 'uncaught exception',
      text: credsLib.redact(String(err?.stack || err), secrets).slice(0, 500),
    }
    consoleErrors.push(e)
    pendingConsole.push(e)
  })
  page.on('response', async res => {
    const url = res.url()
    if (!url.startsWith(runtimeOrigin)) return
    const route = checks.doorRouteOf(url)
    if (!route || !res.ok()) return
    try {
      const body = await res.json()
      seenRoutes[route]++
      for (const f of checks.checkShape(body, shapes[route], route)) {
        pendingShape.push(`door shape: ${f}`)
      }
    } catch (e) {
      pendingShape.push(`door shape: ${route} body is not JSON (${String(e)})`)
    }
  })
}

async function nameSlots(page: Page) {
  const out: {slot: string; text: string}[] = []
  for (const slot of [
    'communityAgentSponsor',
    'communityPostAuthorName',
    'communityRosterName',
  ]) {
    const texts = await page
      .locator(`${tid(slot)}:visible`)
      .allInnerTexts()
      .catch(() => [])
    for (const text of texts) out.push({slot, text})
  }
  return out
}

/**
 * Runs one step: the action, a full-page screenshot, then the hard checks.
 * `action` returns a status override (e.g. already-member) and a reason.
 */
async function step(
  page: Page,
  name: string,
  action: () => Promise<{status?: StepStatus; reason?: string} | void>,
) {
  currentStep = name
  pendingConsole = []
  pendingShape = []
  const index = steps.length
  const file = reportLib.screenshotName(index, name)
  const rel = `e2e/clickthrough/artifacts/${runId}/${file}`
  const result: StepResult = {
    step: name,
    status: 'pass',
    reason: '',
    timestamp: new Date().toISOString(),
    screenshot: null,
  }
  steps.push(result)
  let actionFailed = false
  try {
    const out = await action()
    if (out?.status) result.status = out.status
    if (out?.reason) result.reason = out.reason
  } catch (e) {
    actionFailed = true
    result.status = 'fail'
    result.reason = credsLib.redact(
      String((e as Error)?.message || e).split('\n')[0],
      secrets,
    )
  }
  // Let late console messages and responses for this step land.
  await page.waitForTimeout(750).catch(() => {})
  try {
    await page.screenshot({
      path: `${reportLib.runDir(runId)}/${file}`,
      fullPage: true,
      // A failed sign-in leaves the form up; never capture what was typed.
      mask: [
        page.locator(tid('loginUsernameInput')),
        page.locator(tid('loginPasswordInput')),
      ],
    })
    result.screenshot = rel
  } catch {
    // The page may be gone after a crash; the step result says why.
  }
  const text = await page
    .locator('body')
    .innerText()
    .catch(() => '')
  const failures = [
    ...checks.runHardChecks({
      text,
      nameSlots: await nameSlots(page),
      consoleErrors: pendingConsole,
      knownHandles,
    }),
    ...pendingShape,
  ].map(f => credsLib.redact(f, secrets))
  if (failures.length) {
    result.status = 'fail'
    result.reason = [result.reason, ...failures].filter(Boolean).join('; ')
  }
  if (actionFailed) throw new StopFlow(name)
}

async function signIn(page: Page, handle: string, password: string) {
  await page.goto('/')
  const signInButton = page.locator(tid('signInButton'))
  const loginForm = page.locator(tid('loginForm'))
  await signInButton.or(loginForm).first().waitFor({timeout: 120_000})
  if (await signInButton.isVisible()) await signInButton.click()
  // An account chooser is shown when the browser has signed in before.
  const other = page.getByRole('button', {name: /other account/i})
  await loginForm.or(other).first().waitFor()
  if (await other.isVisible()) await other.click()
  await page.locator(tid('loginUsernameInput')).fill(handle)
  await page.locator(tid('loginPasswordInput')).fill(password)
  await page.locator(tid('loginNextButton')).click()
  await loginForm.waitFor({state: 'detached', timeout: 60_000})
}

async function openCommunity(page: Page) {
  await page.goto(`/c/${COMMUNITY_ID}`)
  await page.locator(tid('communityHeader')).waitFor({timeout: 60_000})
}

async function isMember(page: Page) {
  return page
    .locator(tid('communityMemberBadge'))
    .isVisible()
    .catch(() => false)
}

async function grantToggle(page: Page) {
  const row = page.locator(tid('communityAgentGrantRow'))
  await row.waitFor({timeout: 30_000})
  return row.locator('[aria-checked]').first()
}

async function setGrant(page: Page, on: boolean) {
  const toggle = await grantToggle(page)
  const want = on ? 'true' : 'false'
  if ((await toggle.getAttribute('aria-checked')) === want) {
    return {reason: `grant was already ${on ? 'on' : 'off'}`}
  }
  const saved = page.waitForResponse(
    r =>
      r.url().startsWith(runtimeOrigin) &&
      r.url().includes(`/app/communities/${COMMUNITY_ID}/agent-grant`) &&
      r.request().method() === 'POST',
  )
  await toggle.click()
  const res = await saved
  if (!res.ok()) throw new Error(`agent-grant POST answered ${res.status()}`)
  const body = await res.json()
  if (body?.on !== on) {
    throw new Error(`agent-grant POST answered on=${String(body?.on)}`)
  }
  await page.waitForFunction(
    ([sel, v]) =>
      document
        .querySelector(sel)
        ?.querySelector('[aria-checked]')
        ?.getAttribute('aria-checked') === v,
    [tid('communityAgentGrantRow'), want] as const,
  )
}

async function adminLaunch(browser: Browser) {
  if (!creds.admin) {
    return {
      status: 'skipped' as const,
      reason: 'SKIPPED: no DEVTEST_ADMIN_* credential',
    }
  }
  const ctx = await browser.newContext()
  const admin = await ctx.newPage()
  watch(admin)
  try {
    await signIn(admin, creds.admin.handle, creds.admin.appPassword)
    await openCommunity(admin)
    const control = admin.locator(tid('communityAgentLaunchControl'))
    await control.waitFor({timeout: 30_000})
    if (await admin.locator(tid('communityAgentLaunched')).isVisible()) {
      return {reason: 'agent already launched'}
    }
    await admin.locator(tid('communityAgentLaunchButton')).click()
    await admin
      .locator(tid('communityAgentLaunched'))
      .waitFor({timeout: 60_000})
    return {}
  } finally {
    await ctx.close()
  }
}

test('AO clickthrough on the Dev runtime', async ({page, browser}) => {
  test.skip(!creds.devtest, 'no devtest credential')
  const devtest = creds.devtest!
  watch(page)
  const postText = `Clickthrough ${runId}`

  const flow: [
    string,
    () => Promise<{status?: StepStatus; reason?: string} | void>,
  ][] = [
    [
      'signin',
      async () => {
        await signIn(page, devtest.handle, devtest.appPassword)
      },
    ],
    [
      'join',
      async () => {
        await openCommunity(page)
        if (await isMember(page)) return {status: 'already-member'}
        // The app's own way in first: the Join button on the community home.
        await page.locator(tid('communityJoinButton')).click()
        const joinScreen = page.locator(tid('communityJoinScreen'))
        const holding = page.getByText(/Joining isn.t open yet/)
        await joinScreen.or(holding).first().waitFor()
        if (await holding.isVisible()) {
          notes.push(
            'The Join button on the community home opens the holding sheet ("Joining isn’t open yet", JoinConsentEntry); the join itself went through the app’s join screen at /c/ao-dev-test/join.',
          )
          await page.getByRole('button', {name: 'Not now'}).first().click()
          await page.goto(`/c/${COMMUNITY_ID}/join`)
          await joinScreen.waitFor()
        }
        if (await page.locator(tid('communityJoinNeedsUpdate')).isVisible()) {
          throw new Error('join screen says the app needs an update')
        }
        await page
          .getByRole('checkbox', {name: /read what joining shares/})
          .click()
        await page.locator(tid('communityJoinAgreeButton')).click()
        await page
          .locator(tid('communityJoinSuccess'))
          .waitFor({timeout: 60_000})
        await page.locator(tid('communityJoinGoButton')).click()
        await page
          .locator(tid('communityMemberBadge'))
          .waitFor({timeout: 60_000})
        return {reason: 'joined through the join screen'}
      },
    ],
    [
      'home',
      async () => {
        await page.goto('/')
        await page.locator(tid('communitySwitcher')).waitFor({timeout: 60_000})
      },
    ],
    [
      'community-chip',
      async () => {
        await page.locator(tid(`communityChip-${COMMUNITY_ID}`)).click()
        await page.waitForURL(new RegExp(`/c/${COMMUNITY_ID}(?:[/?#]|$)`))
      },
    ],
    [
      'community-home',
      async () => {
        await page.locator(tid('communityHeader')).waitFor({timeout: 60_000})
        if (!(await isMember(page))) {
          throw new Error('community home does not show the member badge')
        }
      },
    ],
    [
      'agent-card',
      async () => {
        await page.locator(tid('communityAgentCard')).waitFor({timeout: 30_000})
      },
    ],
    ['grant-on', async () => setGrant(page, true)],
    ['grant-off', async () => setGrant(page, false)],
    [
      'members-tab',
      async () => {
        await page.locator(tid('communityTab-members')).click()
        await page.locator(tid('communityMembersSection')).waitFor()
      },
    ],
    [
      'compose',
      async () => {
        await page.locator(tid('communityComposerEntry')).click()
        const editor = page.locator('[contenteditable="true"]').first()
        await editor.waitFor()
        await editor.click()
        await page.keyboard.type(postText)
      },
    ],
    [
      'post',
      async () => {
        const posted = page.waitForResponse(
          r =>
            r.url().startsWith(runtimeOrigin) &&
            new URL(r.url()).pathname ===
              `/app/communities/${COMMUNITY_ID}/posts` &&
            r.request().method() === 'POST',
          {timeout: 60_000},
        )
        await page.locator(tid('composerPublishBtn')).click()
        const res = await posted
        if (!res.ok())
          throw new Error(`community post answered ${res.status()}`)
        await page
          .locator(tid('composerPublishBtn'))
          .waitFor({state: 'detached', timeout: 30_000})
      },
    ],
    [
      'post-in-feed',
      async () => {
        await page.locator(tid('communityTab-posts')).click()
        await page
          .locator(tid('communityPosts'))
          .getByText(postText)
          .first()
          .waitFor({timeout: 60_000})
      },
    ],
    [
      'door-shapes',
      async () => {
        // The Members tab loads thread rosters; with the new post there is at
        // least one thread to load.
        if (!seenRoutes.roster) {
          await page.locator(tid('communityTab-members')).click()
          await page.waitForTimeout(3000)
        }
        const missing = (['timeline', 'roster'] as const).filter(
          r => !seenRoutes[r],
        )
        if (missing.length) {
          throw new Error(
            `no ${missing.join(' or ')} response observed from the Dev door`,
          )
        }
        return {
          reason: `checked ${seenRoutes.timeline} timeline and ${seenRoutes.roster} roster responses against door.json`,
        }
      },
    ],
    ['admin-launch', async () => adminLaunch(browser)],
  ]

  try {
    for (const [name, action] of flow) await step(page, name, action)
  } catch (e) {
    if (!(e instanceof StopFlow)) throw e
    const done = new Set(steps.map(s => s.step))
    for (const [name] of flow) {
      if (done.has(name)) continue
      steps.push({
        step: name,
        status: 'not run',
        reason: `stopped after ${e.message} failed`,
        timestamp: new Date().toISOString(),
        screenshot: null,
      })
    }
  } finally {
    const failed = steps.some(
      s => s.status === 'fail' || s.status === 'not run',
    )
    reportLib.writeArtifacts({
      runId,
      result: failed ? 'FAIL' : 'PASS',
      steps,
      consoleErrors,
      notes,
      secrets,
    })
  }

  const bad = steps.filter(s => s.status === 'fail' || s.status === 'not run')
  if (bad.length) {
    throw new Error(
      `clickthrough failed: ${bad.map(s => `${s.step} (${s.status})`).join(', ')} - see e2e/clickthrough/artifacts/${runId}/REPORT.md`,
    )
  }
})
