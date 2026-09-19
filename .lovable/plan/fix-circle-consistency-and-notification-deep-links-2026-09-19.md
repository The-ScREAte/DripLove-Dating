# Fix Circle consistency and notification deep links

## Scope
- Make notification taps reliably open the intended destination without briefly defaulting to Discover.
- Make “Recommended for you” open the exact Circle profile on cold and warm app launches.
- Apply Circle eligibility rules consistently to Recommended, Similar Interests, and every people category: home country respects distance; premium unlocked countries ignore distance; free users only use their home country; reciprocal preference, age, blocks, matches, prior likes, and active pass cooldowns apply everywhere.
- Keep undecided people eligible in both Discover and Circle. Once liked or passed anywhere, remove them immediately from every visible Circle/Discover surface and cached row.
- Show the daily Circle likes counter inside both the Circle list and Circle profile view.
- Enforce 20 right-swipes per day for free members and 100 for premium members. Passes remain unlimited. Show the correct exhausted state and daily refill.
- Prevent false “no profiles” states by invalidating stale cross-page caches and refreshing from the same current eligibility state.

## Implementation
- Replace Circle’s read-then-update counter with one atomic database action that checks the daily tier limit, records the like, increments Circle usage, and returns the authoritative remaining count and match result.
- Add a shared client-side swipe event so Discover and every Circle row/category remove the chosen profile immediately, then invalidate their caches for the next visit.
- Harden notification payload parsing for Android/iOS string payloads and queue cold-start destinations until the signed-in app and target page are ready.
- Validate directly linked Circle profiles against the viewer’s eligibility rules before displaying them.
- Reuse one Circle eligibility/fetch path for rows, category counts, and category decks to prevent rule drift.

## Verification
- Run the full TypeScript check and existing tests.
- Test public app startup and route parsing in the browser.
- Add focused tests for notification route normalization and Circle limit/cross-page event behavior where practical.
- Inspect the applied database function and verify the limit response shape after migration.
