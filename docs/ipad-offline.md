# Offline play on an 11-inch iPad

## Install once with a connection

1. Open the app's deployed **HTTPS** address in Safari. Ordinary HTTP addresses on a home network cannot install its offline copy.
2. Choose **Share → Add to Home Screen**, enable **Open as Web App** when offered, then Add.
3. Open **Mum's Cards from its Home Screen icon while still online**. Wait for **Ready offline** on the home screen.
4. Turn on Airplane Mode. Reopen the Home Screen app and start or resume a game.

The Home Screen app can have separate website storage from Safari. Set it up in that app; Safari's Ready offline message and saves do not prove the installed app is ready. Make the Home Screen app the place you play.

Clock, FreeCell, Klondike, Pyramid, Spider, Rules, and Settings are included. Games, snapshots, and Undo/Redo history save locally on this iPad. No account or network connection is needed after setup.

Choose a game from its illustrated home-screen tile. During play, drag cards or runs onto legal destinations, or keep using taps. In Clock, drag the active card to its hour; Kings return to their original stock pile. In Pyramid, drag a card onto its partner; tap lone Kings to remove them. Invalid or interrupted drags leave the deal unchanged. In Spider, tap **Hint** again to see the next suggestion; changing the board starts the hint cycle over.

Rotate the iPad to play in landscape. All five boards use the measured space below the toolbar, including a shorter viewport with browser controls visible. Long tableau piles and held-open cards compress their spacing to fit; every card remains present. Card ranks adapt to exposed space, and dragged runs stay inside the screen. Pyramid chooses stock placement to fit its rows; Clock includes its full circle, fans, and labels. Explanations use reserved space below the board, with scrolling inside longer messages. Rotation keeps the deal and Undo/Redo history. Optional debug panels can still need scrolling.

Keep the app's website data. Clearing it can erase saves and the offline copy; iPadOS can also evict website storage. If **Offline setup incomplete** appears, reconnect and choose **Retry offline setup** before relying on offline play again. Offline readiness confirms app files are available; it does not clear a separate save-error message.

## Updates

Open the app online to download updates. Once an update is downloaded, close **all** Mum's Cards windows, then reopen. An active session keeps its existing app version. Downloads are checked against their build's SHA-256 hashes before caching; incomplete or mismatched files never count as a ready offline copy.

## Build and host

From the repository root:

```sh
pnpm web:build
pnpm web:preview
```

Preview uses localhost on port 8081, which is a secure-context exception for local testing. An iPad accessing the computer's LAN HTTP address does not receive that exception. Expo's development server is not the offline installation build.

```sh
pnpm web:package
```

This builds `apps/app/dist` and creates `artifacts/mumscards-ipad-offline-<build>.zip`. Deploy the **unpacked contents at an HTTPS site's root**. The ZIP is a hosting artifact; opening it in the iPad Files app does not install a working offline app.

Packaging requires the `zip` executable on your computer.

`vercel.json` supplies the build/output settings, game routes, and worker cache headers. `serve.json` supplies equivalent local routes without changing `.html` asset URLs. Other hosts must preserve those asset URLs and serve `sw.js` with revalidation. Keep all files from the same build together. Production deployment remains pending; adding this configuration does not update an existing deployment.

## Verification

```sh
pnpm test:offline-build
pnpm typecheck
pnpm test
pnpm web:build
pnpm test:e2e:web
```

Install the required test browsers with `pnpm exec playwright install chromium webkit` if missing. Browser checks target Chromium and WebKit at 11-inch iPad portrait and landscape sizes, plus smaller phone and split-screen viewports. `tests/web/board-fit.spec.ts` checks every board descendant, long saved piles, held-open cards, dragged runs, hints, explanations, and unchanged saves. Browser checks do not establish native or physical iPad acceptance. Offline checks must include cold launches, all five games, Rules, Settings, saved progress, incomplete downloads, and cache recovery.

Playwright WebKit offline emulation can reject service-worker navigations with an internal error ([issue #42775](https://github.com/microsoft/playwright/issues/42775)). The offline tests stop their local server to check cached navigation without that emulation failure.

Installation follows [Apple's iPad guide](https://support.apple.com/guide/ipad/ipad8f1f7a29/ipados). [WebKit documents separate Home Screen storage](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) and [storage persistence limits](https://webkit.org/blog/14403/updates-to-storage-policy/).

Physical iPad and installed Home Screen app acceptance remain unverified. The native attempt created an 11-inch simulator, but T3 device opening timed out and its inventory did not recognize the new simulator. Browser viewport checks do not prove Home Screen installation or iPad storage retention.
