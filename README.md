# Safari Native AirPlay

A standalone Safari bookmarklet for websites where native AirPlay fails to cast video to your TV.

**No extension, casting app, server, dependencies, or paid service.** All code runs in the page in Safari.

**Tested with a Roku TV**. Whether this works with anything else is unknown, but I assume it does in most cases.

## Install on iPhone or iPad

Requires [Safari 18.4 or newer](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).

1. Open Safari and bookmark any webpage.
2. Open your bookmarks, edit that bookmark, and rename it **Native AirPlay** or anything.
3. Open [`dist/bookmarklet.txt`](dist/bookmarklet.txt), copy the entire single line and paste it as the bookmark's URL.
4. Save the bookmark.

## Use

1. Navigate to the video website and run the **Native AirPlay** bookmark prior to starting playback. A small floating chip will appear. The chip should say **Waiting...**
2. Start playback. If the website has server or quality choices, select those **in the website's player first**.

   (This applies only to websites with a custom player. You won't be able to run the bookmark if you're fullscreen obviously.)

3. On playback, the chip should change to **Play native**. Tap it to open the video in Safari's native video element.
4. Use the native player's video AirPlay control to select your TV or Roku. This is **video AirPlay**, not screen mirroring.
5. Tap the floating chip → **Back to site** to return to the site's player. The bookmarklet *should* sync your current playback position back on the site's custom player.
6. Choose **Remove** to remove the bookmarklet's UI and network hooks from the current page. Refreshing the page also removes it.

## What this does

Some websites play HLS video through a JavaScript-managed `blob:` video source. That works locally while native video AirPlay fails. This bookmarklet:

1. Observes page `fetch`, `XMLHttpRequest`, and resource timing requests for `.m3u8` HLS playlists.
2. Picks the most recently observed candidate (rather than listing sources or quality levels).
3. Pauses the site's video, opens the detected playlist in a separate HTML5 video element with Safari's built-in AirPlay controls, and attempts to seek to the same time.
4. Shows the native player's video resolution.

## Dev note

Feel free to contribute in any way! It *can* be a little clunky sometimes. For example, sometimes it will cast audio only. Sometimes it will end the cast abruptly, etc.

For me, refreshing the page and resetting AirPlay back to my device in Control Center usually seem to get it working again.

In my experience, this is due to an unreliable or buffering server, or a bad connection.
