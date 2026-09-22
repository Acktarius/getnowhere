## Purpose

Lets the operator choose a page theme and an accent color, with Dark and Light
surfaces that stay easy to scan and chat-topic glyphs that stay visible.

## ADDED Requirements

### Requirement: Page themes stay dark, light, or system
The app SHALL offer Dark, Light, and System page themes only. System SHALL
follow the host color scheme. Accent choice SHALL NOT add a new page theme.

#### Scenario: Theme list unchanged
- **WHEN** the operator opens Settings → Appearance
- **THEN** the theme choices are Dark, Light, and System
- **AND** no additional page theme named sky or pink is offered

### Requirement: Dark page is lifted charcoal with lighter cards
In the Dark theme the page background SHALL be `#3d4558` (charcoal). Elevated
cards SHALL use the original tile hex `#14161d`. Primary text on
those cards SHALL stay light. Sky and pink SHALL NOT change these surfaces.

#### Scenario: Dark shell contrast
- **WHEN** the resolved theme is Dark
- **THEN** the page background is `#3d4558`
- **AND** cards use `#14161d`
- **AND** body text remains a light color on those cards
- **AND** selecting Sky or Pink does not change the page or card surface hex

### Requirement: Light page is paper grey with white cards
In the Light theme the page background SHALL be `#e6e8ee`. Cards SHALL stay
`#ffffff`. Primary text on those cards SHALL stay dark.

#### Scenario: Light shell contrast
- **WHEN** the resolved theme is Light
- **THEN** the page background is `#e6e8ee`
- **AND** cards remain `#ffffff`
- **AND** body text remains a dark color on those cards

### Requirement: Accents include sky and pink
The accent list SHALL include teal, blue, amber, violet, sky, and pink. Sky
and pink SHALL be accents only: they change the primary highlight, not the
page theme and not the page or card surface colors. Sky SHALL use `#6ec8f0`
as the Dark primary and `#2b9fd4` as the Light primary. Pink SHALL use
`#ff8fb8` as the Dark primary and `#e85a8c` as the Light primary. UI labels
and product docs SHALL name these accents Sky and Pink only.

#### Scenario: Sky and Pink swatches
- **WHEN** the operator opens Settings → Appearance
- **THEN** accent swatches include Sky and Pink in addition to Teal, Blue,
  Amber, and Violet

#### Scenario: Pink applies on Dark
- **WHEN** the resolved theme is Dark and the operator selects Pink
- **THEN** the primary accent color is `#ff8fb8`

#### Scenario: Sky applies on Light
- **WHEN** the resolved theme is Light and the operator selects Sky
- **THEN** the primary accent color is `#2b9fd4`

### Requirement: Unknown accents fall back to teal
If stored accent is not a known accent name, the app SHALL apply teal.

#### Scenario: Unrecognized stored accent
- **WHEN** settings contain an accent name that is not teal, blue, amber,
  violet, sky, or pink
- **THEN** the applied accent is teal

### Requirement: Chat-topic glyphs are visible
The chat-room topic backdrop SHALL keep its tiled topic glyphs and SHALL fill
them at 24% of the primary accent in Dark and 16% in Light.

#### Scenario: Dark room glyphs
- **WHEN** a chat room is shown in Dark
- **THEN** the topic-tile fill is 24% of the current primary accent

#### Scenario: Light room glyphs
- **WHEN** a chat room is shown in Light
- **THEN** the topic-tile fill is 16% of the current primary accent
