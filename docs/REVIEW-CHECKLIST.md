# Review checklist - app fix tasks

Before an app fix task goes to review:

- [ ] `pnpm e2e:clickthrough` was run on the fix branch (see
      `e2e/clickthrough/README.md`).
- [ ] The report names the artifacts folder,
      `e2e/clickthrough/artifacts/<runId>/`.
- [ ] The report attaches that run's `REPORT.md`.
- [ ] Every step is `pass`, `already-member` or an expected `skipped`
      (admin-launch without admin credentials). A run that SKIPPED for want of
      a devtest credential is reported as skipped, not as passed.
- [ ] No credential value appears in the report, the artifacts or the diff.
