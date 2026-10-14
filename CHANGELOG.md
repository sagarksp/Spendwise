# Changelog and project journal

This file tracks implemented changes and the next work that has been identified. Dates use the project context timezone, Asia/Calcutta. Add a dated entry whenever behavior, architecture, setup, or a major decision changes.

## 2026-10-14 — Android install path and repository review

### Implemented

- Added an Android-capable PWA manifest, application icon, offline service worker, and production registration.
- Fixed the date helper so “today” follows the device's local calendar date rather than UTC. This avoids assigning the prior/next day around UTC midnight for users outside UTC.
- Expanded README with current behavior, architecture, data model, local setup, environment variables, Android install instructions, known backend gap, and review notes.

### Review findings

- `npm run dev` and the cloud-backup UI refer to an Express backend at `server/index.ts`, but no `server/` source exists in this checkout. Local browser tracking remains usable. Cloud backup and Google authentication cannot work until the API is implemented.
- `.env.example` describes MySQL, JWT, Google, and CORS configuration for that missing backend. Treat those settings as intended configuration, not evidence of a running service.
- Reminder preferences are stored, but notification scheduling is not implemented.
- A language preference is stored, but the UI is English-only.
- Android package support is an installable PWA. This workspace has no Android SDK, Java/Gradle environment, or native wrapper, so a signed APK/AAB was not produced.
- The application was not test-driven; this review records source and build observations only.

### Build record

- Production build completed successfully on Node.js 24.20.0 using `npm run build` (TypeScript check and Vite production bundle).
- The default shell Node.js 16.20.2 cannot run Vite 7; use a supported Node.js version.

## Upcoming work (not yet implemented)

1. **Decide Android delivery target.** For Play Store or direct APK distribution, add and document a native wrapper (Capacitor or Trusted Web Activity), install Android Studio/SDK/JDK, establish application ID/signing ownership, and build/debug on a real device. The PWA is sufficient for browser-based checking.
2. **Implement the backup service.** Add the Express API, MySQL schema/migrations, Google ID-token verification, session lifecycle, per-user data isolation, validation, rate limits, sync conflict policy, and export/delete flows. Update setup instructions and verify end-to-end only once credentials/services are available.
3. **Make the client contract reliable.** Define cursor semantics, deletion propagation, conflict UX, retries/offline queue behavior, and tests against the actual API. Review token storage and CSRF/CORS behavior before production.
4. **Finish settings behavior.** Either implement reminders and Hindi copy or label/remove those settings until supported.
5. **Mobile QA.** Check Android install/update/offline behavior, safe-area spacing, IndexedDB retention, accessibility, and browser compatibility on target devices.
6. **Add automated checks when requested/approved.** There is currently no test script or test suite in `package.json`.

## Entry template

```md
## YYYY-MM-DD — Short change title

### Implemented
- ...

### Decisions / findings
- ...

### Follow-up
- ...
```
