# UI Kit

A small web app for designers. You keep one UI kit for each client: colors for light and dark mode, fonts and their weights, border widths, and the text of the preview. You invite your clients to look at their kit, or to edit it with you. The developer of each client downloads the values and uses them in code.

## What you can do

- Add a client. Each client gets a kit that starts with a full set of basic sections.
- Change each value and see it in a light and a dark preview.
- Add your own sections and elements.
- Invite a person to a kit, with "Can view" or "Can edit" permission.
- Download a kit as a PDF for people, or download its data for developers.

## Screenshots

Screenshots will be added here.

## Put it live on Launchd

[Launchd](https://launchd.eu) puts a web app live at its own address. Only the people that you invite can open it. You do not need a server or a database.

1. Install the Launchd command on macOS or Linux:

   ```sh
   curl -fsSL https://github.com/launchdhq/cli/releases/latest/download/install.sh | sh
   ```

   On Windows, run this in PowerShell:

   ```powershell
   irm https://github.com/launchdhq/cli/releases/latest/download/install.ps1 | iex
   ```

2. Download this app and open its folder:

   ```sh
   git clone https://github.com/launchdhq/ui-kit.git
   cd ui-kit
   ```

3. Make a file named `.env` in the folder, with the email that you use on Launchd:

   ```
   OWNER_EMAIL=you@yourstudio.com
   ```

   The owner adds clients and invites people. Launchd keeps this value as a secret. It does not put the `.env` file online.

4. Deploy:

   ```sh
   golaunchd deploy
   ```

   The first time, the command opens your browser so that you can sign in. At the end, it prints the address of your app. If you cannot add a client, run `golaunchd deploy` again. On the first deploy, the secret can arrive after the build starts.

5. Open the address, add a client, and add the people who work on its kit.

6. Invite the same people on [launchd.eu/apps](https://launchd.eu/apps). Launchd lets only invited people open your app. You can invite 2 people for each app.

## Who can do what

| | Owner | Can edit | Can view |
|---|---|---|---|
| Add and delete clients | Yes | No | No |
| Invite people and change their permission | Yes | No | No |
| Change values, sections and elements | Yes | Yes | No |
| See the kit, download the PDF and the data | Yes | Yes | Yes |

A person sees only the kits that they are invited to. The owner sees all kits.

## Your data

Each kit is one file in the app's data folder. Launchd keeps that folder when you deploy a new version, and backs it up. If you delete the app on Launchd, the data is deleted too. Download your data first.

## Run it on your computer

You need [Node.js](https://nodejs.org) 24.

```sh
OWNER_EMAIL=you@yourstudio.com npm start
```

The app reads the visitor's email from the `X-Launchd-Email` header, which Launchd adds after sign-in. On your computer, a tool must add that header.

Run the tests with `npm test`.

## Versions

The app shows its version next to "UI Kit" at the top of each page. [CHANGELOG.md](CHANGELOG.md) lists what each version changed. To update your app, pull the newest version, then run `golaunchd deploy` again. Your kits stay.

To make a new version, change `version` in `package.json` and add a section for it at the top of `CHANGELOG.md` in the same pull request. When the pull request is merged, GitHub makes the release.

## License

MIT. See [LICENSE](LICENSE).
