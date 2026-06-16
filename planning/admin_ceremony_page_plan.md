# Admin Ceremony Page For Results Publishing

## Summary
Add an admin-authenticated ceremony page designed for a laptop connected to a 16:9 1080p broadcast output. Admins can open it from the Voting page after the People's Choice cutoff has passed. Before results are published it shows a shuffled slideshow of all approved vehicle photos. After results are published it starts on a Father's Day Show & Shine logo/title slide, then allows manual operator navigation through each category winner and each special award winner. While on a winning vehicle, that winner's vehicle photos rotate automatically.

## Key Changes
- Add an admin-only ceremony route in the admin app, for example `/admin/ceremony`, rendered without the normal admin sidebar/chrome.
- Add an **Open Ceremony Page** button on the admin Voting page:
  - Disabled until the voting cutoff has passed.
  - Opens the ceremony route in a new tab/window.
  - Available before and after results are published.
- Add a protected ceremony API endpoint for admin/staff sessions:
  - Before publish: return all approved photos for checked-in vehicles, shuffled client-side.
  - After publish: return the published results snapshot plus winner slides.
- Ceremony display behavior:
  - Full-screen black broadcast canvas.
  - Fixed 16:9 stage with `aspect-ratio: 16 / 9`, centered with letterboxing if browser/window is not exact 16:9.
  - Designed for 1920x1080 output at 59.94; no scrolling, no mobile layout, no public header.
  - Use contained foreground images with blurred/dimmed fill background so portrait and landscape photos remain aspect-correct.
- Pre-publish mode:
  - Auto-rotating shuffled slideshow of all approved vehicle photos.
  - Minimal overlay: event logo and optional **Results coming soon** message.
- Post-publish mode:
  - First slide: Father's Day Show & Shine logo/title.
  - Manual winner navigation: click, space, right arrow for next winner; left arrow for previous winner.
  - One winner slide per top category winner and one per top special award winner.
  - Each winner slide shows award/category name, vehicle year/make/model, entry number, owner name when public, and a photo carousel for that winning vehicle.
  - Winner photo carousel loops through all approved photos for the vehicle while staying on that winner.
  - Hero/primary photo displays for **10 seconds**.
  - Other vehicle photos display for **5 seconds** each.
  - Include an unobtrusive winner counter for the operator.

## Interfaces
- Admin API adds a ceremony read endpoint, for example `GET /voting/ceremony`.
- Response shape:
  - `event`: cutoff, results published state, published timestamp.
  - `photoSlides`: approved photo slides for pre-publish mode.
  - `winnerSlides`: logo slide plus top category and special award winners when results are published.
- Winner slides must include all approved vehicle photos, ordered with hero/primary first.
- Reuse existing published result snapshot data instead of recalculating winners in the ceremony page.
- Reuse existing public/admin logo assets; do not alter the regular public results page carousel.

## Test Plan
- Admin Voting page shows ceremony button disabled before cutoff and enabled after cutoff.
- Ceremony route requires admin/staff auth.
- Before publish, ceremony page loads approved photos and shuffles/advances them without scrolling or distortion.
- After publish, ceremony page starts on the logo slide and manually advances through winners.
- Winner photo carousel starts on hero/primary photo, holds it for 10 seconds, then rotates other photos every 5 seconds and loops.
- Advancing to a new winner resets that winner's photo carousel to the hero/primary photo.
- Portrait, landscape, and missing-photo winner cases render correctly in 16:9.
- Keyboard and click navigation work.
- Production builds pass for admin web and API.
- API tests cover pre-publish response, post-publish response, and auth requirement where practical.

## Assumptions
- Ceremony page is admin-only, not public.
- Public visitor pages and the regular public results page remain unchanged.
- "Top winner only" means one winner per category plus one winner per special award.
- Pre-publish slideshow uses all approved photos from checked-in vehicles, not just hero photos.
- Manual operator control advances winners; photo rotation within a winner is automatic.
