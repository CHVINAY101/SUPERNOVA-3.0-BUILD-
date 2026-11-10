# Changes in this update (5 Nov 2026)

Reference used for structure: designbomb.it (sections and calls to action only; its colours and fonts could not be read).

## Added
- Home: "Venue and timings" block (reads Admin > Settings; "Get directions" button appears once `venue_map_url` is published).
- Home: "Sponsors and partners" block, grouped by tier, with a "Become a partner" button (uses the contact email once set, otherwise opens the Contact page). It promises no benefits.
- Home: "Get updates on WhatsApp" button, shown only when the WhatsApp number is set in Admin > Settings.
- Sponsors page: the same "Become a partner" box.
- Navigation: Esports and Sponsors links. Footer: Sponsors and Announcements links.

## Fixed
- Hero headline "SUPERNOVA" was cut off on every desktop width. It now sizes itself to its column.
- Institution names now follow the project brief (five names, including National Kannada Medium School).
- Organiser line now reads from Admin > Settings (default matches the brief).
- Venue, organiser and institution names live in one file, `src/lib/event.ts`, instead of about ten places.
- Settings are fetched once per page instead of once per component.

## Database (run in the Supabase SQL editor)
- `0009_venue_map_setting.sql`: adds the optional venue map setting.
- `0010_close_direct_inserts.sql`: stops anyone posting registrations straight into the tables, bypassing the checks. Safe to run twice.

## Still to confirm (marked TODO in `src/lib/event.ts`)
- Venue: still defaults to "The National College" until confirmed.
- "National PO College" is written as in the brief; change to "PU" if that was a typo.
