import {useCallback} from 'react'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {AUTHORITY_ONE_SUPPORT_URL} from '#/lib/constants'
import {useSession} from '#/state/session'

// Repointed off Bluesky's Zendesk onto our own support page.
// TODO(support): our support page is static, not a Zendesk ticket form, so the
// tf_* prefill params below are ignored. Wire a real contact form if/when one
// exists (and rename this constant once it's no longer Zendesk-shaped).
export const ZENDESK_SUPPORT_URL = AUTHORITY_ONE_SUPPORT_URL

export enum SupportCode {
  AA_DID = 'AA_DID',
  AA_BIRTHDATE = 'AA_BIRTHDATE',
}

/**
 * {@link https://support.zendesk.com/hc/en-us/articles/4408839114522-Creating-pre-filled-ticket-forms}
 */
export function useCreateSupportLink() {
  const {_} = useLingui()
  const {currentAccount} = useSession()

  return useCallback(
    ({code, email}: {code: SupportCode; email?: string}) => {
      const url = new URL(ZENDESK_SUPPORT_URL)
      if (currentAccount) {
        url.search = new URLSearchParams({
          tf_anonymous_requester_email: email || currentAccount.email || '', // email will be defined
          tf_description:
            `[Code: ${code}] — ` + _(msg`Please write your message below:`),
          /**
           * Custom field specific to {@link ZENDESK_SUPPORT_URL} form
           */
          tf_17205412673421: currentAccount.handle + ` (${currentAccount.did})`,
        }).toString()
      }
      return url.toString()
    },
    [_, currentAccount],
  )
}
