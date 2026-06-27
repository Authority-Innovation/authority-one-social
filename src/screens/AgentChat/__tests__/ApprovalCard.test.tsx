/**
 * Regression test for the garbled approval-button label bug.
 *
 * SYMPTOM (live, in-app): the AgentChat approval card's APPROVE button rendered
 * as a raw Lingui message ID (e.g. "Z7ZXbT") because its `<Trans>Approve</Trans>`
 * macro ID was missing from the compiled catalog — the same compiled-catalog miss
 * already fixed for the chat title, composer placeholder, and drawer labels.
 *
 * FIX: the Approve/Reject labels are now PLAIN STRING LITERALS, so they render
 * the same regardless of catalog state.
 *
 * A full render test is impractical here: importing the component pulls in the
 * `#/alf` → Layout → Dialog → bottom-sheet chain, which the jest-expo preset
 * can't evaluate (Platform.Version is undefined), and this repo ships no other
 * component render tests. So this is a SOURCE-LEVEL guard that pins exactly the
 * thing that regresses — a Lingui macro standing in for a plain label — without
 * evaluating the heavy native import graph.
 */
import {readFileSync} from 'fs'
import {join} from 'path'

const SRC = readFileSync(join(__dirname, '..', 'ApprovalCard.tsx'), 'utf8')

describe('ApprovalCard labels are plain literals (no compiled-catalog dependency)', () => {
  it('does not wrap the Approve/Reject labels in a Lingui <Trans> macro', () => {
    expect(SRC).not.toMatch(/<Trans>\s*Approve\s*<\/Trans>/)
    expect(SRC).not.toMatch(/<Trans>\s*Reject\s*<\/Trans>/)
  })

  it('does not import any Lingui macro (the source of the raw-msg-ID render)', () => {
    expect(SRC).not.toMatch(/@lingui\/(react|core)\/macro/)
    // no live <Trans ...> element remains (comments mentioning the word are fine)
    expect(SRC).not.toMatch(/<Trans[\s>]/)
  })

  it('renders the Approve and Reject button text as plain string literals', () => {
    expect(SRC).toMatch(/<ButtonText>Approve<\/ButtonText>/)
    expect(SRC).toMatch(/<ButtonText>Reject<\/ButtonText>/)
  })

  it('keeps plain-string accessibility labels on both buttons', () => {
    expect(SRC).toMatch(/label="Approve"/)
    expect(SRC).toMatch(/label="Reject"/)
  })
})
