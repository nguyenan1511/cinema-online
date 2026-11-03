# DESIGN.md — Đi Rạp Online

Source: /plan-design-review, 2026-11-02 (decisions 8A, 9A). Design doc: `~/.gstack/projects/annguyen/annguyen-cinema-online-design-20261102-102820.md`.

## Direction: "Rạp quốc doanh"
The old Vietnamese state-run cinema: tickets printed on colored paper stock, a red rubber-stamped seat number, oxblood velvet halls, warm marquee bulbs. Nostalgic, specific, collectible. Not: neon glow, gradients, emoji decoration, uniform rounded cards.

## Color (CSS variables)
| Token | Hex | Use |
|---|---|---|
| `--hall` | #2B1216 | auditorium background, text plates |
| `--velvet` | #6E1F2A | seats, raised surfaces |
| `--ink` | #2A2320 | text on ticket stock |
| `--stamp` | #C8372D | seat stamp, perforation marks, errors |
| `--bulb` | #F2C14E | the one accent: primary CTA, countdown ring, focus rings |
| `--stamp-on-hall` | #F08A7E | error text on `--hall` (7.2:1); `--stamp` on hall is only 3.36:1 |
| `--notice` | #F3E3A1 | notice labels on hall (past-showing label) |
| `--hall-text` | #F6E9E4 | primary text on hall |
| `--hall-text-2` | #C9A9A6 | secondary text on hall (tinted, never gray) |
| `--stock-1200` | #F3E3A1 | ticket paper, 12:00 showing |
| `--stock-1930` | #F4C9C4 | ticket paper, 19:30 showing |
| `--stock-2200` | #CFE8D5 | ticket paper, 22:00 showing |

All body text/background pairs meet at least 4.5:1 contrast. Selection, caret and focus rings use `--bulb`. Errors use `--stamp-on-hall` on the hall and `--stamp` on ticket stock (large stamp text only: 3.5-4:1 meets the 3:1 large-text rule).

## Type
Be Vietnam Pro (latin + latin-ext + vietnamese) for all reading text. **Bungee** (Vietnamese subset) is the display face: marquee titles, stamps, ticket buttons only, never body text.
| Role | Size / weight |
|---|---|
| Display (film title, stamp seat) | 32 / 800 |
| Title | 24 / 800 |
| Heading | 18 / 500 |
| Body | 16 / 400 (never smaller for body) |
| Caption | 13 / 500 (labels only) |

## Spacing and shape
- 4px base: 4, 8, 12, 16, 24, 32, 48.
- More space above a heading than below it.
- Radius: 2px on the ticket (paper), 999px only on chips. No other rounding by default.
- Depth: tickets cast an offset shadow (0 6px 16px rgba(0,0,0,.35)). No zero-offset glows.

## Components
| Component | Spec | States |
|---|---|---|
| Primary CTA | full width, 52px tall, `--bulb` fill, `--ink` text 16/800 | default, pressed (darken 8%), disabled (40% opacity), countdown (ring fills over 10s) |
| Secondary button | 48px tall, 1.5px `--hall-text-2` outline | default, pressed |
| Showtime chip | 40px tall pill, `--velvet` fill; selected = `--bulb` outline + its stock color dot | default, selected |
| Seat button | 40px square + 4px gap (44px hit area), `--velvet` fill, native `<button>` with aria-label; rows split 6+6 by a 16px aisle (decision 10A) | free, taken (initials), mine (stamp), next-to-host (pulse) |
| Ticket | 1080×1350 render; stock color by showtime; perforation; stamped seat; QR on the stub part | full, text-only (no poster), loading shimmer |
| Toast | top, 3s, `--hall` plate, `--hall-text` 16/500 | info, error (`--stamp` left icon) |
| Step dots | 5 dots, 8px, 8px gap, top center | done (`--bulb`), current (`--hall-text`), todo (`--hall-text-2` 40%) |

## Motion
One authored moment per screen; exponential ease-out from a visible default; content never waits on animation. Lights dim: 1.5s fade. Respect `prefers-reduced-motion` (see the design doc, Pass 6).

## HUD language: "cuống vé" (added in the design pass for the walkable 3D cinema)
Every HUD element is cinema ephemera (classes in src/index.css):
| Class | What it is |
|---|---|
| `.ticket` | Ticket stock panel with notched sides + grain; set `--stock` per showtime |
| `.torn-top` | Torn top edge for bottom sheets |
| `.perf` | Perforated tear line |
| `.bulbs` | Marquee frame with chasing bulbs (objective bar, intro sign) |
| `.stamp` | Red rubber-stamp heading (Bungee) |
| `.btn-ticket` | Primary action: bulb-yellow ticket with notches, pressed state drops 3px |
| `.reel` | Film-reel joystick ring |
Motion: only the bulb chase and the sheet slide-in; both off under `prefers-reduced-motion`.
Characters: KayKit Adventurers heroes (Hiệp sĩ, Chiến binh, Pháp sư, Sát thủ, Thích khách; CC0, Kay Lousberg), 1.5 m tall, one signature prop each, hidden when seated or holding popcorn. Staff are heroes without weapons; their role shows on the name tag.


## Hall UI: "Letterbox HUD" (Nov 2026)
- In the hall, the HUD lives in black letterbox bars (top: kicker + title + presence pill; bottom while the film plays: progress hairline, mute, bullet-comments toggle, chat input, souvenir CTA, licence credit). Nothing overlaps the screen.
- The bars slide in when you sit down (bar-down / bar-up, 0.9s): the "lights down" moment.
- Chat: game-style feed bottom-left (fades after 9s), speech bubbles over heads in 3D, Enter opens the input on desktop, 💬 pill on touch. During the film, messages fly across the top of the screen (bullet comments, toggle 弾); hidden under prefers-reduced-motion.
- Other real players: dark name pill with a gold rim (NPCs/staff use light pills).

## Intro + booking: "premium kiosk" (Nov 2026)
- Intro: blurred poster of the featured film as the backdrop, neon RẠP ONLINE wordmark, big Bungee headline (or the invite card), a horizontal rail of real posters, and a character card (live 3D preview, name, hero chips, gold CTA). Desktop: two columns, the card sticks.
- Ticket counter is a dark kiosk sheet with steps Phim → Ghế → Xác nhận; buying reveals an e-ticket (poster, room, seat, QR-style code).
- Game Zone / karaoke HUD reuses the same dark glass + gold: coin pill, round red GẮP! button, rarity glows for gacha (SR blue, SSR gold), lyric bar, quiz options A–D with green/red reveal, emote stack (1–4 keys).
