"""The blog: one how-to per kind of TV (content.TVS) and per thing you can do with All TV Kit.

Each article is the topic's steps (the same on every TV: they're the app's screens) plus what that TV
does differently (how it plays, what it asks, what to check), from PLATFORMS below. Keep those notes in
step with how the app behaves on each TV (the All TV Kit repo's CLAUDE.md, "TV Casting Architecture").
"""

PUBLISHED = "2026-11-16"

# MARK: Topics

TOPICS = [
    {
        "id": "connect", "slug": "how-to-connect-iphone-to-{x}", "label": "Connect",
        "title": "How to Connect an iPhone to {title_art}",
        "h1": "How to connect your iPhone to {art}",
        "lead": "Connecting your iPhone to {art} with All TV Kit takes a few seconds: both on the same Wi-Fi, pick "
                "the TV, done. Nothing to install on the TV, and All TV Kit remembers it for next time.",
        "shot": ("home", "All TV Kit's Home screen with the Connect your TV button"),
        "steps": None,  # each TV's own, PLATFORMS[…]["connect"]
        "tips": [
            "The phone and the TV must be on the same Wi-Fi network, not a guest network.",
            "All TV Kit needs Local Network access (iOS asks the first time). If you said no: Settings › All TV Kit › Local Network.",
            "Turn off any VPN on the phone while you cast.",
            "No TV found at all? Any TV with a web browser works through smrr.tv.",
        ],
    },
    {
        "id": "photos", "slug": "cast-photos-and-videos-from-iphone-to-{x}", "label": "Photos & videos",
        "title": "How to Cast Photos and Videos from iPhone to {title_art}",
        "h1": "How to cast photos and videos from your iPhone to {art}",
        "lead": "With All TV Kit you can show the photos and videos from your iPhone's library on {art}, in full "
                "quality, and swipe through them on the phone while the TV follows.",
        "shot": ("detail_media", "Casting a photo from the iPhone's library with All TV Kit"),
        "steps": [
            "Connect All TV Kit to {art}.",
            "On All TV Kit's Home, tap Photos & Videos and allow access to your photos.",
            "Pick Videos or Photos at the top, then tap the one you want.",
            "Tap Start casting. It shows on the TV in a moment.",
            "Swipe through the strip under the picture: the TV follows. Videos play, pause and seek from the phone.",
        ],
        "tips": [
            "Auto play (the button at the start of the strip) turns it into a slideshow: 5 to 30 seconds a photo, "
            "videos to the end, and Repeat to start over.",
            "With limited photo access, only the photos you picked show up. To show them all: Settings › All TV Kit › Photos › Full Access.",
            "Your photos and videos go from your iPhone to the TV over your Wi-Fi. They aren't uploaded anywhere.",
            "Casting stops when you close the screen.",
        ],
    },
    {
        "id": "images", "slug": "show-web-images-on-{x}-from-iphone", "label": "Web images",
        "title": "How to Show Free Web Images on {title_art} from an iPhone",
        "h1": "How to show beautiful free images on {art}",
        "lead": "All TV Kit searches millions of free, openly licensed images from Wikimedia Commons (landscapes, "
                "space, cities, animals, art) and shows them full screen on {art}, one by one or as a slideshow.",
        "shot": ("webimage_detail", "A Wikimedia Commons landscape ready to cast with All TV Kit"),
        "steps": [
            "Connect All TV Kit to {art}.",
            "On All TV Kit's Home, tap Web Images.",
            "Search for anything, or tap a topic: Nature, Space, Cities, Animals, Ocean, Mountains, Art, Flowers.",
            "Tap an image, then tap Start casting.",
            "Swipe to the next image and the TV follows, or turn on the slideshow.",
        ],
        "tips": [
            "Each image shows its title, author and licence: tap ↗ to open its page on Wikimedia Commons.",
            "Recent searches are kept on the start screen, so your favourite topics are one tap away.",
            "Images that may be mature are filtered out.",
        ],
    },
    {
        "id": "iptv", "slug": "watch-free-live-tv-on-{x}-with-iphone", "label": "Live TV (IPTV)",
        "title": "How to Watch Free Live TV Channels (IPTV) on {title_art} with an iPhone",
        "h1": "How to watch free live TV channels on {art}",
        "lead": "All TV Kit lists more than 9,000 free, public live TV channels from over 180 countries (news, "
                "sports, movies, music, kids and more) and plays them on {art} with one tap. You can add your own "
                "M3U playlists too.",
        "shot": ("iptv", "All TV Kit's IPTV screen: playlists, categories and countries"),
        "steps": [
            "Connect All TV Kit to {art}.",
            "On All TV Kit's Home, tap IPTV.",
            "Pick a country or a category, or search for a channel by name.",
            "Tap a channel: it starts on the TV. Tap another to switch.",
            "Tap ☆ to keep a channel in Favorites; tap + to add an M3U playlist link.",
        ],
        "tips": [
            "The channel keeps playing when you leave the list or lock your phone. Stop it from the bar at the bottom of Home.",
            "Channels are free public streams from the iptv-org list: at any moment some are offline or only play in "
            "their own country. If one doesn't start, try another.",
            "Your own playlist must be an HTTPS link to an M3U file (or to a single HLS stream).",
        ],
    },
    {
        "id": "youtube", "slug": "cast-youtube-from-iphone-to-{x}", "label": "YouTube",
        "title": "How to Cast YouTube from iPhone to {title_art}",
        "h1": "How to cast YouTube from your iPhone to {art}",
        "lead": "Find a YouTube video in All TV Kit and tap Cast to TV: {art} plays it itself, in full quality, "
                "starting from where you were, while your phone stays free.",
        "shot": ("youtube", "Finding a YouTube video to cast in All TV Kit"),
        "steps": [
            "Connect All TV Kit to {art}.",
            "On All TV Kit's Home, tap YouTube.",
            "Pick a topic (Music, News, Sports, Live…) or search, and open a video.",
            "Tap Cast to TV. The video starts on the TV from the point you were at.",
        ],
        "tips": [
            "The video keeps playing when you leave the screen. Tap Stop to close it on the TV.",
            "Casting the video is better than mirroring it: the TV plays it in full quality with the sound in sync.",
        ],
    },
    {
        "id": "webvideos", "slug": "cast-web-videos-from-iphone-to-{x}", "label": "Web videos",
        "title": "How to Cast Videos from Any Website to {title_art} with an iPhone",
        "h1": "How to cast videos from websites to {art}",
        "lead": "Open a website in All TV Kit, play its video, and tap Cast to TV: All TV Kit finds the video (not the "
                "ad) and {art} plays it in full quality while you keep browsing.",
        "shot": ("webvideos", "All TV Kit's web video browser with popular sites"),
        "steps": [
            "Connect All TV Kit to {art}.",
            "On All TV Kit's Home, tap Web Videos.",
            "Open a site from the shortcuts, or type its address.",
            "Play the video on the page. Cast to TV turns on once All TV Kit finds it.",
            "Tap Cast to TV. If it found several videos, pick the right one (\"1 of 3\").",
        ],
        "tips": [
            "All TV Kit blocks ad networks and never casts very short clips, so ads stay off the TV.",
            "Sites that protect their videos (Netflix, Prime Video, Disney+) can't be cast.",
            "Keep All TV Kit open while it plays. Browsing is private: no history, cookies or cache are kept.",
        ],
    },
    {
        "id": "camera", "slug": "show-iphone-camera-on-{x}", "label": "Camera",
        "title": "How to Show Your iPhone Camera Live on {title_art}",
        "h1": "How to show your iPhone's camera live on {art}",
        "lead": "All TV Kit turns your iPhone into a live camera for {art}: show the room, a whiteboard, a document, "
                "your pet or yourself, with the front or back camera.",
        "shot": ("home", "All TV Kit's Home screen with the Camera tile"),
        "steps": [
            "Connect All TV Kit to {art}.",
            "On All TV Kit's Home, tap Camera and allow camera access.",
            "Pick the front or back camera, and turn Sound on if you want the microphone too.",
            "Tap Start casting. The TV shows what the camera sees, level with the horizon.",
        ],
        "tips": [
            "The front camera is mirrored on the TV, like in the preview.",
            "Casting stops when you close the screen or leave the app (iOS stops the camera).",
        ],
    },
]

# MARK: TVs

# For each content.TVS id: how to say it in a sentence ({art} in the topics; {title_art} in their titles,
# when it's capitalised differently), its slug in URLs, how connecting goes, and what it does differently
# per topic (None: the topic isn't available there).
PLATFORMS = {
    "samsung": {
        "art": "a Samsung TV", "x": "samsung-tv",
        "connect": [
            "Turn on your Samsung TV and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. Your Samsung TV shows up by its name.",
            "Tap it. The first time, the TV asks whether to allow All TV Kit: choose Allow with the remote.",
            "Connected. All TV Kit remembers the TV, and the TV remembers All TV Kit, so it isn't asked again.",
        ],
        "connect_notes": [
            "All TV Kit works with Samsung smart TVs from 2016 on (Tizen). It connects to the TV's remote-control "
            "connection and its built-in media player, so nothing has to be installed on the TV.",
            "Chose Deny by mistake? The TV remembers it. On the TV open Settings › General › External Device Manager "
            "› Device Connection Manager › Device List, then allow All TV Kit or delete it so the TV asks again.",
        ],
        "photos": "The Samsung TV plays them in its own media player: All TV Kit serves each photo or video from your "
                  "iPhone over your Wi-Fi and the TV fetches it, so videos play in full quality with the TV's sound. "
                  "iPhone videos in HEVC go as they are; if your TV can't play one, All TV Kit sends it as H.264 "
                  "instead and remembers that for next time.",
        "images": "Images show in the TV's own media player, sized for the TV's screen.",
        "iptv": "Your Samsung TV is first given the channel's stream to play by itself. If it isn't playing within a few "
                "seconds, All TV Kit passes the stream through your iPhone instead and remembers that your TV needs it; "
                "the phone can be locked, but keep it on the Wi-Fi.",
        "youtube": "On Samsung the video opens in the TV's own YouTube app, which All TV Kit controls the way YouTube's "
                   "phone app does, starting at the point you were watching.",
        "webvideos": "Samsung's player gets the video as one continuous stream through your iPhone, with the site's ad "
                     "breaks joined in, so it plays from start to end; seeking from the phone restarts it at that point.",
        "camera": "With sound: turn Sound on before you start and All TV Kit adds the microphone.",
    },
    "lg": {
        "art": "an LG TV", "x": "lg-tv",
        "connect": [
            "Turn on your LG TV and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. Your LG TV shows up by its name.",
            "Tap it. The first time, the TV asks whether to allow All TV Kit: choose Allow (or Yes) with the remote.",
            "Connected. All TV Kit keeps the TV's key, so it connects straight away next time.",
        ],
        "connect_notes": [
            "All TV Kit works with LG smart TVs running webOS. Nothing is installed on the TV: All TV Kit talks to it the "
            "way LG's own phone apps do.",
            "Missed the message or chose Deny? Just connect again and the TV asks again. On older LG TVs, turn on "
            "LG Connect Apps in the TV's network settings first.",
        ],
        "photos": "On LG, All TV Kit first plays them in the TV's web browser, which it opens for you and which plays "
                  "the most kinds of video. A few seconds in, it asks \"Is it playing on your TV?\": tap No and it "
                  "closes the browser and uses the TV's own player instead. Either way the photos and videos go over "
                  "your Wi-Fi, not the internet.",
        "images": "All TV Kit opens the TV's web browser, which loads the image straight from Wikimedia Commons in full "
                  "resolution. If nothing shows, tap No when All TV Kit asks \"Is it playing on your TV?\" and it uses "
                  "the TV's own player.",
        "iptv": "The channel plays in the LG TV's web browser, which handles what LG's own player doesn't: ad breaks in "
                "free channels, separate audio and encrypted streams. If it doesn't play, tap No when All TV Kit asks "
                "\"Is it playing on your TV?\" and it tries the TV's player.",
        "youtube": "On LG the video opens in the TV's own YouTube app, at the point you were watching.",
        "webvideos": "All TV Kit opens the TV's web browser and sends it the video's link. If the site only plays it with "
                     "your phone's cookies, your iPhone streams it to the TV instead.",
        "camera": "The camera shows in the TV's web browser first, with the same \"Is it playing on your TV?\" check; "
                  "No switches to the TV's own player.",
    },
    "roku": {
        "art": "a Roku", "x": "roku",
        "connect": [
            "Turn on your Roku TV or Roku player and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. Your Roku shows up by its name.",
            "Tap it to connect. No code to type.",
            "Connected. All TV Kit remembers your Roku for next time.",
        ],
        "connect_notes": [
            "All TV Kit works with Roku TVs (TCL, Hisense, Sharp, Philips and other Roku TV models) and Roku streaming "
            "players: the Roku Express, Streaming Stick and Ultra.",
            "Roku not listed? On the Roku, open Settings › System › Advanced system settings › Control by mobile apps "
            "and set Network access to Default.",
            "On a Roku, All TV Kit mirrors your screen, with sound, in the Roku's own player. Photos, videos, the camera, "
            "YouTube and live TV don't cast to a Roku yet.",
        ],
        # Screen mirroring only (RokuService): no casting yet.
        "photos": None,
        "images": None,
        "iptv": None,
        "youtube": None,
        "webvideos": None,
        "camera": None,
    },
    "googletv": {
        "art": "a Google TV", "x": "google-tv",
        "connect": [
            "Turn on your Google TV and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. Your TV shows up with the name it has in Google Home "
            "(for example Living Room TV).",
            "Tap it to connect. No code, no message on the TV.",
            "Connected. All TV Kit connects to it again next time.",
        ],
        "connect_notes": [
            "Google TV has Chromecast built in, and that's how All TV Kit talks to it: on Sony, TCL, Hisense and Philips "
            "Google TVs, the Chromecast with Google TV and the Google TV Streamer.",
            "Not listed? Wake the TV fully (not standby), check it's on the same Wi-Fi as the phone, and that All TV Kit "
            "has Local Network access.",
        ],
        "photos": "Photos go to the TV over your Wi-Fi as full-screen pictures; videos play in All TV Kit's player on the "
                  "TV, with play, pause and seek on the phone.",
        "images": "Images show full screen through the TV's built-in Chromecast.",
        "iptv": "The TV fetches the channel itself, so it keeps playing even when your phone is locked or out of the room.",
        "youtube": "The video plays in YouTube's player inside All TV Kit's app on the TV, from the point you were watching.",
        "webvideos": "The TV plays the video through All TV Kit, which passes the site's video along from your phone; "
                     "keep All TV Kit open while it plays.",
        "camera": "With sound: turn Sound on before you start and All TV Kit adds the microphone.",
    },
    "androidtv": {
        "art": "an Android TV", "x": "android-tv",
        "connect": [
            "Turn on your Android TV and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. Your TV shows up by its Chromecast name.",
            "Tap it to connect. No code, no message on the TV.",
            "Connected. All TV Kit connects to it again next time.",
        ],
        "connect_notes": [
            "Nearly every Android TV has Chromecast built in, and All TV Kit talks to the TV through it: Sony BRAVIA, "
            "Philips, Xiaomi, TCL, Sharp, the Mi Box, the Xiaomi TV Stick and NVIDIA SHIELD.",
            "Not listed? Wake the TV fully (not standby), check it's on the same Wi-Fi as the phone, and that All TV Kit "
            "has Local Network access.",
        ],
        "photos": "Photos go to the TV over your Wi-Fi as full-screen pictures; videos play in All TV Kit's player on the "
                  "TV, with play, pause and seek on the phone.",
        "images": "Images show full screen through the TV's built-in Chromecast.",
        "iptv": "The TV fetches the channel itself, so it keeps playing even when your phone is locked or out of the room.",
        "youtube": "The video plays in YouTube's player inside All TV Kit's app on the TV, from the point you were watching.",
        "webvideos": "The TV plays the video through All TV Kit, which passes the site's video along from your phone; "
                     "keep All TV Kit open while it plays.",
        "camera": "With sound: turn Sound on before you start and All TV Kit adds the microphone.",
    },
    "chromecast": {
        "art": "a Chromecast", "x": "chromecast",
        "connect": [
            "Turn on the TV your Chromecast is plugged into, and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. The Chromecast shows up with its Google Home name.",
            "Tap it to connect. No code, no Google Home app needed.",
            "Connected. All TV Kit connects to it again next time.",
        ],
        "connect_notes": [
            "Every Chromecast works, with or without Google TV, and so do TVs with Chromecast built in such as VIZIO "
            "SmartCast TVs.",
            "Not listed? Check the Chromecast is on the same Wi-Fi as the phone (not a guest network), and that "
            "All TV Kit has Local Network access in Settings.",
        ],
        "photos": "Photos go to the TV over your Wi-Fi as full-screen pictures; videos play in All TV Kit's player on the "
                  "Chromecast, with play, pause and seek on the phone.",
        "images": "Images show full screen through the Chromecast.",
        "iptv": "The Chromecast fetches the channel itself, so it keeps playing even when your phone is locked.",
        "youtube": "The video plays in YouTube's player inside All TV Kit's app on the Chromecast, from the point you were "
                   "watching.",
        "webvideos": "The Chromecast plays the video through All TV Kit, which passes the site's video along from your "
                     "phone; keep All TV Kit open while it plays.",
        "camera": "With sound: turn Sound on before you start and All TV Kit adds the microphone.",
    },
    "firetv": {
        "art": "a Fire TV", "x": "fire-tv",
        "connect": [
            "Turn on your Fire TV and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit and tap Connect your TV. Your Fire TV shows up by its name.",
            "Tap it to connect. No app on the Fire TV, no pairing, no code.",
            "Connected. All TV Kit connects to it again next time.",
        ],
        "connect_notes": [
            "Every Fire TV has a media player built in, and All TV Kit uses it: Fire TV Sticks (including the 4K and "
            "4K Max), the Fire TV Cube, and smart TVs with Fire TV built in.",
            "Not listed? Press Home on the Fire TV remote to wake it, and check it's on the same Wi-Fi as the phone.",
        ],
        "photos": "Photos go as pictures and videos as MP4 files served from your iPhone over your Wi-Fi. Fire TV can't "
                  "play HEVC, the iPhone's default video format, so All TV Kit converts those videos to H.264 first; long "
                  "videos take a moment.",
        "images": "Images show full screen in the Fire TV's built-in player.",
        "iptv": "The Fire TV plays the channel's stream itself, so it keeps playing without your phone.",
        "youtube": None,
        "webvideos": "The Fire TV plays the site's video as passed along by your iPhone; keep All TV Kit open while it plays.",
        "camera": "Picture only: Fire TV's built-in player shows the camera without sound.",
    },
    "airplay": {
        "art": "an Apple TV", "x": "apple-tv",
        "connect": [
            "Turn on your Apple TV or AirPlay TV and put your iPhone on the same Wi-Fi.",
            "Open All TV Kit, tap Connect your TV, then Choose an AirPlay device.",
            "Pick your Apple TV or AirPlay TV in iOS's AirPlay menu. The first time, the TV may show a code to type on "
            "the iPhone.",
            "Connected: All TV Kit shows \"Connected via AirPlay\". To disconnect, open the same menu and pick iPhone.",
        ],
        "connect_notes": [
            "This works with the Apple TV HD and Apple TV 4K, and with TVs that have AirPlay built in: many Samsung, "
            "LG, Sony, VIZIO, TCL and Roku models from 2018 on.",
            "To mirror your whole screen to an AirPlay device, use Control Center › Screen Mirroring: Apple doesn't "
            "let apps start it.",
        ],
        "photos": "Videos play over AirPlay, and so do photos: All TV Kit turns each one into a short still video. With "
                  "Screen Mirroring on in Control Center, photos show directly on the TV instead.",
        "images": "Images go over AirPlay as still videos, or straight onto the TV when Screen Mirroring is on in "
                  "Control Center.",
        "iptv": "The channel plays over AirPlay: the Apple TV fetches the stream itself.",
        "youtube": None,
        "webvideos": "The video plays over AirPlay; keep All TV Kit open while it plays.",
        "camera": "Turn on Screen Mirroring in Control Center first: the camera then shows full screen on the TV, "
                  "without sound.",
    },
    "browser": {
        "art": "a web browser", "title_art": "a Web Browser", "x": "web-browser",
        "connect": [
            "On the TV, computer or tablet, open smrr.tv in its web browser. It shows a 6-digit code and a QR code.",
            "In All TV Kit, tap Connect your TV, then Mirror to a web browser.",
            "Type the code, or tap Scan QR code and point the camera at it.",
            "Connected. The page shows your phone instead of the code.",
        ],
        "connect_notes": [
            "Any screen with a modern web browser works: smart TVs that All TV Kit doesn't find as TVs, Windows PCs, "
            "Macs, Chromebooks and tablets. For an LG or Samsung TV nearby, \"Open on…\" opens its browser for you.",
            "The phone and the browser connect directly, so they must be on the same Wi-Fi. Keep the page open; "
            "reloading it reconnects by itself.",
        ],
        "photos": "Photos and videos go straight from your iPhone to the browser over your Wi-Fi as a live stream, "
                  "filling the screen in 16:9, with the video's sound.",
        "images": "The page loads the image itself from Wikimedia Commons, in full resolution.",
        "iptv": "The page plays the channel itself, so it keeps playing after you lock your phone; reloading the page "
                "picks it up again.",
        "youtube": "The video plays in YouTube's player on the smrr.tv page, from the point you were watching.",
        "webvideos": "The page is sent the video's link and plays it itself. If the site only plays it with your "
                     "phone's cookies, your iPhone streams it to the page instead.",
        "camera": "Streamed live over your Wi-Fi, with sound when Sound is on.",
    },
}


def topic(topic_id):
    return next(t for t in TOPICS if t["id"] == topic_id)


def posts():
    """Every article: (tv id, topic), skipping topics a TV can't do."""
    result = []
    for tv_id, p in PLATFORMS.items():
        for t in TOPICS:
            if t["id"] == "connect" or p.get(t["id"]):
                result.append((tv_id, t))
    return result


def slug(tv_id, t):
    return t["slug"].format(x=PLATFORMS[tv_id]["x"])
