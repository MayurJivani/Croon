---
name: Croon
description: A karaoke lounge in a browser, built as a cassette deck and its J-card.
colors:
  shell-0: "#0b090a"
  shell: "#0d0b0c"
  shell-2: "#171415"
  shell-3: "#221e1f"
  shell-4: "#2e2829"
  stage-black: "#070606"
  line: "rgba(255, 240, 230, 0.09)"
  card: "#f2e8dc"
  card-2: "#e6dccf"
  card-ink: "#1c1716"
  card-dim: "#6b5e55"
  text: "#efe6dc"
  muted: "#b0a49d"
  faint: "#8a7f80"
  tomato: "#ff4f2e"
  marigold: "#ffc23d"
  teal: "#2ec4b6"
  plum: "#b388eb"
  rose: "#ff8fab"
  lit: "#ffd36b"
typography:
  display:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 6vw, 5rem)"
    fontWeight: 850
    lineHeight: 0.95
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62"
  display-jcard:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "clamp(5rem, 9.4vw, 9.4rem)"
    fontWeight: 850
    lineHeight: 0.84
    fontVariation: "'wdth' 54"
  headline:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 3vw, 2.4rem)"
    fontWeight: 850
    lineHeight: 0.95
    fontVariation: "'wdth' 70"
  title:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 850
    lineHeight: 0.95
    fontVariation: "'wdth' 80"
  spine-title:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 76"
  key:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 90"
  counter:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 75"
  lyric-now:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "clamp(30px, 5.2vw, 70px)"
    fontWeight: 900
    lineHeight: 1.08
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 76"
  lyric-stage:
    fontFamily: "'Anybody Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "clamp(40px, 6.4vw, 140px)"
    fontWeight: 900
    lineHeight: 1.08
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 76"
  hand:
    fontFamily: "'Kalam', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans KR', cursive"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.1
  hand-title:
    fontFamily: "'Kalam', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans KR', cursive"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "'Hanken Grotesk Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Hanken Grotesk Variable', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  spine: "3px"
  digit: "4px"
  jcard: "6px"
  key: "8px"
  label: "10px"
  panel: "12px"
  card-shell: "14px"
  stage: "16px"
  toggle: "18px"
  cassette: "26px"
  round: "50%"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  shelf: "6px"
  queue: "8px"
  row: "12px"
  panel: "18px"
  page-top: "32px"
  section: "clamp(48px, 7vw, 96px)"
components:
  key:
    backgroundColor: "#272223"
    textColor: "{colors.text}"
    typography: "{typography.key}"
    rounded: "{rounded.key}"
    padding: "0 22px"
    height: "48px"
  key-hot:
    backgroundColor: "#e8401f"
    textColor: "#1a0b06"
    typography: "{typography.key}"
    rounded: "{rounded.key}"
    padding: "0 22px"
    height: "48px"
  key-card:
    backgroundColor: "#e3d8ca"
    textColor: "{colors.card-ink}"
    typography: "{typography.key}"
    rounded: "{rounded.key}"
    padding: "0 22px"
    height: "48px"
  key-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.key}"
    rounded: "{rounded.key}"
    padding: "0 22px"
    height: "48px"
  key-sm:
    padding: "0 14px"
    height: "36px"
  key-lg:
    padding: "0 30px"
    height: "60px"
  icon-btn:
    backgroundColor: "{colors.shell-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.key}"
    size: "40px"
  icon-btn-pressed:
    backgroundColor: "{colors.marigold}"
    textColor: "{colors.card-ink}"
  spine:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    typography: "{typography.spine-title}"
    rounded: "{rounded.spine}"
    padding: "6px 14px 6px 0"
    height: "44px"
  spine-dim:
    backgroundColor: "{colors.shell-3}"
    textColor: "#c4b9bb"
  src-tag:
    backgroundColor: "{colors.card-ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.spine}"
    padding: "5px 7px"
  src-tag-warn:
    backgroundColor: "{colors.tomato}"
    textColor: "#1a0b06"
  qitem:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.digit}"
    padding: "8px 10px 8px 0"
  qitem-blank:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
  jcard:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.jcard}"
    padding: "26px 28px 70px"
  cassette-label:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.label}"
    padding: "84px 28px 24px"
  slot:
    backgroundColor: "{colors.shell-0}"
    textColor: "{colors.lit}"
    rounded: "{rounded.key}"
    padding: "0 16px"
    height: "54px"
    width: "230px"
  tape-digit:
    backgroundColor: "{colors.shell-0}"
    textColor: "{colors.lit}"
    typography: "{typography.counter}"
    rounded: "{rounded.digit}"
    size: "30px x 42px"
  input:
    backgroundColor: "{colors.shell-0}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.key}"
    padding: "0 14px"
    height: "48px"
  toggle:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.toggle}"
    padding: "0 14px"
    height: "36px"
  toggle-pressed:
    backgroundColor: "{colors.marigold}"
    textColor: "{colors.card-ink}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "7px"
    height: "40px"
  tab-selected:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
  panel:
    backgroundColor: "{colors.shell-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "18px"
  pill-live:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.card-ink}"
    rounded: "12px"
    padding: "4px 9px"
---

# Design System: Croon

## Overview

**Creative North Star: "The Cassette J-Card"**

Every song is a tape and every room is a mixtape being written live. The ground is a smoked black cassette shell; anything printed (song spines, the J-card, the cassette label, queue entries, the score card) is warm off-white card stock with felt-tip handwriting on it. The only saturated fields are the printed inlay bands in tomato, marigold and teal, the same three stripes that run across the top of the cassette label and the foot of the J-card. Controls are tape-deck keys with a visible body that sinks when pressed; time is a lit tape counter and a strip of brown tape that fills marigold as it plays.

The room is dark at rest. Only three things carry light: the line being sung, the singer who is up, and the control that is pressed. Everything else sits back in shell greys and dim ink so the lyric reads from a sofa several metres away. The interface is dark only, by brand commitment.

Density is moderate on the phone and personal surfaces, and enormous on the stage, where type is set in viewport units and the lyric is the largest thing in the room. Motion is mechanical: short throws, spring-loaded keys, reels turning at a constant tape speed, and lyric wipes that move linearly with the audio clock.

**Key Characteristics:**
- Two stocks only: dark cassette shell and light J-card stock.
- Inlay bands (tomato, marigold, teal) as the only saturated fields; marigold means lit.
- Three hands: condensed printed display, felt-tip Kalam for people and artists, Hanken Grotesk for UI prose.
- Songs are tape spines on a shelf, never artwork tiles.
- Deck keys with 5px of travel; recessed wells for anything that reads out a value.
- Lyric wipes are linear with time, never eased.

## Colors

A near-black warm shell, cream card stock, and three printed inlay inks, with marigold reserved for whatever is lit.

### Primary
- **Inlay Marigold** (marigold): the lit colour. The sung portion of the current lyric, the played length of the tape band, pressed toggles and icon buttons, the focus ring, the caret, text selection, the room code, the "you are up" strip on the phone, earned badges, the first place on a leaderboard, and the stage progress bar.
- **Deck Lamp** (lit): the warmer LED amber used only for readouts inside recessed wells: tape counter digits and the typed room code in the label slot.

### Secondary
- **Inlay Tomato** (tomato): the hot key (primary action, one per view), the brand's middle O, the top inlay band, the second duet part, and failure states (offline status dot, error toast tint, the "original recording" source warning, low grade rings). On card stock it is also the lyric wipe colour inside the hero cassette label.

### Tertiary
- **Inlay Teal** (teal): connected and live states (status dot, live pill, mic level meter), the first duet part, lyric translations, and top grades (darkened to #148c82 on card stock for contrast).
- **Plum and Rose** (plum, rose): genre inks only. Together with the three inlay colours they colour the band on a song spine by genre, and nowhere else.

### Neutral
- **Smoked Shell** (shell): page ground. **Shell Well** (shell-0) is the deepest tone, used inside recessed wells, the cassette window and inputs. **Stage Black** (stage-black) is the player and TV stage ground.
- **Shell Raised** (shell-2, shell-3, shell-4): tonal steps for panels and cards, nested rows and pressed side items, and borders, scrollbars and inactive dots.
- **Hairline** (line): the one divider on dark surfaces (nav underline, panel borders, now-card dividers).
- **J-Card Stock** (card) and **Faded Stock** (card-2): printed surfaces and the reel hubs. **Card Ink** (card-ink) is text on stock; **Pencil** (card-dim) is secondary text on stock. Felt-tip artist names on stock use a slightly darker brown (#5e534b).
- **Paper White Text** (text), **Muted** (muted), **Faint** (faint): text on the shell in three steps; faint is the floor for counts and timestamps.

### Named Rules
**The Lit Marigold Rule.** Marigold means "this is lit now". It marks the sung word, the pressed control, the played tape and the focused element. It is never a decorative fill on idle chrome.

**The Inlay Band Rule.** Saturated colour arrives as printed bands: the three-stripe inlay, the 10 to 12px genre band on a spine or queue entry, the hot key. Large saturated backgrounds are reserved for a single state strip (the phone's "you are up" bar) and never for panels.

**The Two Stocks Rule.** A surface is either shell or card stock. Card stock means printed matter (songs, queue entries, the J-card, labels, the score card, the selected tab). Do not introduce a third surface colour.

## Typography

**Display Font:** Anybody Variable (falling back to Noto Sans Devanagari, Noto Sans Gurmukhi, then system-ui)
**Handwritten Font:** Kalam 400 and 700 (falling back to Noto Sans Devanagari, then cursive)
**Body Font:** Hanken Grotesk Variable (falling back to Noto Sans Devanagari, Noto Sans Gurmukhi, then system-ui)

**Character:** Anybody is pulled hard along its width axis so headings read like the tall condensed type printed on a J-card spine; Kalam is the felt-tip pen someone used to write the track list; Hanken Grotesk is the quiet small print.

### Hierarchy
- **Display** (850, clamp(2.6rem, 6vw, 5rem), 0.95, width 62%): page titles. On the J-card it grows to clamp(5rem, 9.4vw, 9.4rem) at width 54% and line height 0.84, with the second line in tomato.
- **Headline** (850, clamp(1.6rem, 3vw, 2.4rem), width 70%): section heads.
- **Title** (850, 1.25rem, width 80%): card and crate titles.
- **Spine and Queue Titles** (800, 15 to 17px, width 76%, uppercase, 0.02em): song names printed on spines and queue entries.
- **Key Labels** (800, 15px, width 90%, uppercase, 0.06em; 12.5px small, 18px large).
- **Numerals** (700 to 900, width 58 to 75%, tabular figures): tape counter digits, scores, ranks, the room code (letter-spaced 0.2 to 0.3em).
- **Lyric, current line** (900, clamp(30px, 5.2vw, 70px), 1.08, width 76%); on the stage clamp(40px, 6.4vw, 140px). Next line at roughly half size, past lines smaller again at 50% opacity. All lyric sizes multiply by a user scale (`--lyr-scale`).
- **Handwritten** (Kalam 400, 15 to 22px; 700 at 28px for the label title): artist names, singer names (up to clamp(48px, 6vw, 90px) in the spotlight), room names, translations, side labels, leaderboard names.
- **Body** (Hanken 400, 16px, 1.5): prose, capped at 60 to 72ch.
- **Label** (Hanken 700, 11 to 13px, 0.08 to 0.14em, uppercase): panel heads, field labels, source tags, pills.

### Named Rules
**The Three Hands Rule.** Printed things (spine and queue titles, keys, numbers) are Anybody; people, artists and anything written on a label by hand (the cassette label's song title, side labels, translations) are Kalam; instructions are Hanken. A person's name is never set in the display face.

**The Narrower When Bigger Rule.** Hierarchy comes from width as much as size: the larger the type, the more condensed (key labels at 90%, card titles 80%, spine titles 76%, page titles 62%, the J-card 54%).

**The Script Coverage Rule.** Every stack carries Noto fallbacks for Devanagari, Gurmukhi, Japanese and Korean, so Hindi, Punjabi, J-pop and K-pop lyrics render in a real face. Fontsource splits each by unicode range, so a page downloads only the glyphs it shows.

## Layout

Pages sit in a centred column up to 1440px with the fluid gutter on both sides, 32px above and 96px below (110px on mobile to clear the tab bar). Sections are separated by clamp(48px, 7vw, 96px). Lists are tight stacks: 6px between spines on a shelf, 8px between queue entries, 4px between board rows.

- **Landing:** a two-thirds cassette beside a one-third J-card; under 1000px the J-card moves above the cassette and its join slot appears inside the J-card.
- **Library:** a 240px sticky filter rail beside the shelf; under 900px the rail becomes two selects.
- **Player:** the stage box beside a 320px settings panel; stacks under 1000px.
- **Room:** phone first, a single 720px column: room bar, now card, tabs, then the queue as Side A and Side B.
- **Stage (TV):** a fixed full-viewport three-row grid (top bar, lyric, bottom bar) with padding of 3.2vh by 3.6vw and every size in clamp() with vw terms so it scales to the screen. Top bar: phase readout, song title, source tag, and the join code with QR on the right. Bottom bar: singer, scores, and the up-next queue at minmax(320px, 34vw). With a video, the middle row splits 1.35 to 1. A 6px marigold progress line runs along the bottom edge.

Breakpoints are 560px (compact phone), 760px (tab bar replaces nav links, spines go two-row), 860 and 900px (columns collapse), and 1000px (hero and player stack).

## Elevation & Depth

Depth is physical rather than ambient: objects (the cassette, the J-card, the score card, the record sleeve) cast long soft drops onto the shell; controls have a body edge; readouts are sunk into wells. Panels and lists on the shell stay flat and separate by tone and a hairline.

### Shadow Vocabulary
- **Key body** (`box-shadow: 0 5px 0 var(--kd), 0 8px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14)`): the visible side of a deck key. Pressed: `0 1px 0 var(--kd), 0 2px 6px rgba(0,0,0,0.4)` with a 4px drop.
- **Hot key glow** (`0 10px 24px rgba(255,79,46,0.28)` beneath the key body): the primary action only.
- **Object drop** (`0 30px 60px rgba(0,0,0,0.6)`; the cassette shell uses `0 40px 80px rgba(0,0,0,0.6)`): free-standing printed objects on the shell.
- **Recessed well** (`inset 0 2px 8px #000`): the room code slot, the search field, counter digits (`inset 0 2px 6px #000`), the cassette window.
- **Shelf pull** (`-6px 0 0 var(--shell-4), 0 6px 16px rgba(0,0,0,0.35)` with a 6px slide right): a spine being drawn off the shelf on hover.
- **Lyric glow** (`text-shadow: 0 0 30px rgba(255,194,61,0.45)`): the currently sung word only.

### Named Rules
**The Key Travel Rule.** A deck key has 5px of body and travels 4px when pressed. A key that stays on (a latched state) stays down with `aria-pressed`. Ghost keys travel 2px with no body.

**The Readout Well Rule.** Anything that reads out a value (room code, tape counter, search input) is sunk into a shell-0 well; nothing that displays a value is raised.

## Shapes

Corners follow the objects they imitate. Printed strips are nearly square: spines and source tags 3px, queue entries and counter digits 4px, the J-card 6px. Deck keys, inputs and wells are 8px. The cassette label is 10px, panels 12px, room cards 14px, the stage box 16px, and the cassette shell 26px with an inner moulding line inset 12px at 18px. The cassette window is a full stadium. Circles mark tokens: the Side letter, avatars, status dots, the grade ring, badge seals, swatches. Toggles are pills (18px). Genre and part colour arrive as a straight band clipped flush to the left edge of a strip.

## Components

### Deck Keys
Tactile and mechanical: a key you press, not a link you hover.
- **Shape:** gently squared (8px), 48px tall, 22px side padding; small 36px, large 60px.
- **Plain:** a dark gradient face (#3a3334 to #272223) with a #0a0809 body, paper white uppercase label.
- **Hot:** tomato face (#ff6a4c to #e8401f) on a #8a2412 body with dark ink and a soft tomato glow. One per view.
- **Card:** cream face for keys sitting on dark ground that need a printed look.
- **Ghost:** transparent with a 2px inset outline in the current colour; on the J-card it takes card ink.
- **States:** hover brightens 12%; active and latched sink 4px in 90ms; disabled desaturates and dims without travel. Focus is the global 3px marigold ring at 3px offset.
- **Icon buttons:** 40px shell-3 squares (8px); pressed turns marigold with card ink.

### Tape Spines (song rows)
- **Shape:** a cream strip at least 44px tall, 3px corners, with a 12px genre band flush left.
- **Content:** uppercase condensed title (capped at 46% of the row), Kalam artist, then language, year and the source tag on the right.
- **Unplayable:** the strip drops to shell-3 with a grey band and an outlined "needs a karaoke track" tag.
- **Hover:** slides 6px right with the shelf pull shadow in 160ms.
- **Enter:** staggered 30ms per row (capped at 12), sliding in 14px over 320ms.
- **Mobile:** two rows, title over artist, band 10px, meta stacked right.

### Source Tags
Small uppercase Hanken labels (11px, 0.08em) on card ink. "Original recording" turns tomato; a missing source is an outline. They always say what the audio is.

### J-Card and Cassette Label
- **J-card:** cream stock, 6px corners, object drop, display headline with the tomato second line, the three inlay bands across the foot (40px).
- **Cassette:** a smoked gradient shell (26px) with four screws, a cream label carrying the three bands across the top (60px), a black Side disc, a Kalam title, the live lyric, and the window with two turning reels over a strip of brown tape. Below the label, the deck row holds the room code slot, a counter and the play key.

### Tape Counter and Tape Band
- **Counter:** each digit in its own shell-0 cell with deck-lamp numerals and tabular figures; colons are bare.
- **Tape band:** a 14px track painted as brown tape (#3a2a22 to #5a4032) that fills marigold up to the played position; a 22px cream thumb with a shell-0 ring. Read-only viewers get the same band as a progress bar.

### Lyrics
- **Lines:** past, now and next stacked and centred (or pinned top or bottom by preference), inactive ink #8f8485.
- **Styles:** classic (a marigold copy of each word clipped from left to right by elapsed time), word (each word turns marigold and lifts 0.06em with the lyric glow), line (the whole line lights), cinematic (larger, width 62%, unsung words at 18% opacity and 2px blur, sung words in card stock), dual (two parts, left and right aligned).
- **Duets:** part one teal, part two tomato, both marigold, each line led by a small coloured dot; lines for the other part drop to 38% opacity.
- **Extras:** romanisation in Hanken under the line, translation in teal Kalam, and a three-dot marigold count-in.
- **On card stock:** the label lyric wipes in tomato over card ink and hides past lines.

### Queue (Side A and Side B)
- **Entry:** a cream strip (4px) with a 10px band, position number, two-line clamped title, Kalam artist, and translucent icon buttons for votes and actions.
- **Sides:** each side is headed by a cream Side disc and a Kalam label.
- **Blank tape:** an empty slot is a transparent strip with a 2px shell-4 inset outline and grey band.
- **Motion:** entries spring in from the left (stiffness 420, damping 34) and exit 40px right.

### Inputs and Fields
- **Style:** shell-0 fill, 1px shell-4 border, 8px corners, 48px tall, marigold caret.
- **Focus:** 3px marigold outline at 1px offset; the slot and search wells add a 3px marigold ring around the well.
- **Labels:** uppercase Hanken field labels above, faint hints below. Errors are a tomato-tinted toast (#ffb3a3 on 14% tomato).

### Toggles, Segments and Tabs
- **Toggles** (binary filters): 36px outlined pills that fill marigold when on.
- **Segments and tabs** (choose one): the selected option lifts to card stock with card ink. Tab labels are uppercase display at 13px, 0.1em.

### Navigation
A 64px sticky bar (56px on mobile) in 92% shell with blur and a hairline. The CROON wordmark is display 900 at width 58% with a tomato middle O. Links are muted 14px Hanken that turn paper white over a 2px tomato underline when active. Under 760px a five-item bottom tab bar replaces them, active in marigold.

### Score Reveal
A cream card with a giant condensed total (120px, width 58%), a stamped grade ring (tomato, teal for S and A), and category bars in card ink that grow from the left over 1.1s, staggered.

### Spotlight
The singer announcement: a warm conic beam that swings in over 2.2s, the singer's avatar ringed in their colour, their name in large Kalam and the song in condensed uppercase display.

### State Vocabulary
One vocabulary on every surface: pressed or on is marigold; selected-one-of-many is card stock; connected or live is teal; offline or failed is tomato; unplayable is a shell-grey spine; empty is blank tape; inactive people, unearned badges and the other duet part dim to 38 to 55% opacity; disabled keys desaturate.

### Motion Grammar
Keys move in 90ms, hover slides in 160ms, lyric lines settle in 260 to 360ms, all on one ease-out curve (cubic-bezier(0.16, 1, 0.3, 1)). Reels turn at a constant 2.4s per revolution, linear, and only while audio is playing. Lyric wipes are driven by the audio clock and are linear. Under `prefers-reduced-motion` every transition and animation collapses and the reels stop.

## Do's and Don'ts

### Do:
- **Do** list songs as tape spines: a cream strip with a genre band flush left, condensed uppercase title, Kalam artist and a source tag.
- **Do** keep the room dark at rest: light only the sung line, the singer who is up and the pressed control (Lit Marigold Rule).
- **Do** make every action a deck key with 5px of body and 4px of travel; use one hot key per view.
- **Do** sink value readouts into shell-0 wells with deck-lamp digits.
- **Do** set people's and artists' names in Kalam and printed titles in condensed Anybody (Three Hands Rule).
- **Do** drive lyric wipes and reels linearly from the audio clock.
- **Do** label every track's source on the spine, the queue and the stage.
- **Do** size stage type with clamp() and viewport units so it reads from a sofa.

### Don't:
- **Don't** lay songs out as a grid of rounded album-art cards under a search bar; artwork appears only as the single sleeve on a song page or blurred behind the player.
- **Don't** use neon glow on chrome; the only glow is on the word being sung and the count-in dots.
- **Don't** add a third surface colour beyond shell and card stock.
- **Don't** use plum or rose outside genre bands.
- **Don't** ease a lyric wipe or spin reels while audio is paused.
- **Don't** set a person's name in the display face.
- **Don't** introduce a light theme; Croon is dark only.
