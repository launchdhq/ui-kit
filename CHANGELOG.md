# Changelog

Each version of UI Kit, newest first. The version is in `package.json`. When a change to `main` has a new version, GitHub makes a release with the notes from this file.

## [0.6.0] - 2026-11-16

### Added

- Preview as viewer on the kit page. The owner and editors see the kit as a viewer sees it, then click Back to editing. The preview changes nothing on the server.

### Changed

- The kit page saves by itself, 1 second after the last change. A notice at the top says "Saved", or what stops the save. The Save button is gone.
- A save from an old copy of a kit no longer overwrites newer changes. The page says that someone else changed the kit and offers Reload.
- Download data, Copy CSS and Download CSS save a waiting change first.

## [0.5.0] - 2026-11-16

### Added

- Labels for each kit, for example "By designer" or "By Claude". Editors add and remove them at the top of the kit form, and choose one under each color, font and border. The labels are in Download data and in the PDF, not in the CSS.

## [0.4.0] - 2026-11-16

### Added

- Copy CSS and Download CSS on the kit page. The CSS has the light colors, fonts and borders in `:root`, the dark colors in a dark-mode block, and the font links. SCSS can use it as it is. (#5)

## [0.3.0] - 2026-11-16

### Changed

- A new kit starts with neutral values, not the colors of one brand. (#4)
- Each color, font and border shows "Default" or "Custom". The tag changes after a save. (#4)

### Removed

- The "Designer's color" and "Added by Claude" tags. (#4)

## [0.2.0] - 2026-11-15

### Added

- The client list, with Download data for each client and Download all data. (#2)
- The kit page: colors on their light and dark backgrounds, fonts with weight and URL, border samples, preview text, a light and dark preview, and the People panel for the owner. (#2)
- Download PDF and Download data on the kit page. (#2)
- GitHub runs the tests for each pull request and each change to `main`. (#3)

## [0.1.0] - 2026-11-15

### Added

- The server, with one file for each kit in the data folder. (#1)
- Roles for each kit: the owner from `OWNER_EMAIL`, and editors and viewers that the owner adds. (#1)
- Rules for each value: colors, fonts and font URLs, border widths and preview text. (#1)
