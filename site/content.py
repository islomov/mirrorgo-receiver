"""What mirrorgo.app says: the app's features, the TVs, and the help text.

Keep it in step with the app (MirrorGo repo): the help answers are the app's own FAQ
(`Localizable.strings`, keys `faq.<id>.q` / `.a` / `.1`… / `.note`), the features follow what each TV
can play (`MediaCastCoordinator.canCast`, `CameraCastCoordinator.canCast`, `YouTubeCasting`).
"""

# MARK: Site

# Where the site is served: its own domain, at the root. (BASE_PATH = "/landing-page" with
# SITE_URL = "https://smrr.tv" builds it into ../web/landing-page instead, as it was first served.)
SITE_URL = "https://mirrorgo.app"
BASE_PATH = ""
APP_NAME = "MirrorGo"
# The App Store id (the digits in apps.apple.com/app/…/id<digits>). Empty until the app is live:
# the download buttons then say "Coming soon to the App Store" and link nowhere.
APP_STORE_ID = ""
SUPPORT_EMAIL = "support@smrr.tv"
MIN_IOS = "16.6"

TAGLINE = "Screen mirroring and casting for iPhone"
ONE_LINER = (
    "MirrorGo is an iPhone app that mirrors your screen to your TV and casts photos, videos, your camera, "
    "web videos, live TV channels and YouTube to it. It works with Samsung, LG, Google TV, Chromecast, "
    "Fire TV, Apple TV and any web browser, with nothing to install on the TV."
)

# MARK: TVs

# Columns of the compatibility table, and the TV guides.
TVS = [
    {"id": "samsung", "name": "Samsung", "color": "#4aa8ff", "page": "mirror-iphone-to-samsung-tv"},
    {"id": "lg", "name": "LG", "color": "#ff7ab6", "page": "mirror-iphone-to-lg-tv"},
    {"id": "google", "name": "Google TV & Chromecast", "short": "Google TV", "color": "#4cd98a", "page": "mirror-iphone-to-chromecast"},
    {"id": "firetv", "name": "Fire TV", "color": "#ffb547", "page": "mirror-iphone-to-fire-tv"},
    {"id": "airplay", "name": "Apple TV & AirPlay", "short": "AirPlay", "color": "#c8c8d0", "page": None},
    {"id": "browser", "name": "Any web browser", "short": "Browser", "color": "#a897ff", "page": "mirror-iphone-to-browser"},
]

YES = ("yes", None)


def note(text):
    return ("yes", text)


NO = ("no", None)

# Rows: feature → what each TV in TVS does.
COMPATIBILITY = [
    ("Screen mirroring", {"samsung": YES, "lg": YES, "google": YES, "firetv": note("No sound"),
                          "airplay": note("From Control Center"), "browser": YES}),
    ("Photos & videos", {t["id"]: YES for t in TVS}),
    ("Camera", {"samsung": YES, "lg": YES, "google": YES, "firetv": note("No sound"),
                "airplay": note("With Screen Mirroring on"), "browser": YES}),
    ("Web videos", {t["id"]: YES for t in TVS}),
    ("Live TV channels (IPTV)", {t["id"]: YES for t in TVS}),
    ("YouTube", {"samsung": YES, "lg": YES, "google": YES, "firetv": NO, "airplay": NO, "browser": YES}),
    ("Web images", {t["id"]: YES for t in TVS}),
]

# MARK: Features (Home's tiles, same colours)

FEATURES = [
    {
        "id": "screen-mirroring", "name": "Screen mirroring", "icon": "mirroring", "colors": ("#7A60FF", "#5C44E2"),
        "short": "Your whole iPhone screen on the TV, with sound, in any app.",
    },
    {
        "id": "photos-videos", "name": "Photos & videos", "icon": "home_gallery", "colors": ("#4AA8FF", "#1F6FEB"),
        "short": "Your library on the big screen, videos in full quality, with a slideshow.",
    },
    {
        "id": "camera", "name": "Camera", "icon": "home_camera", "colors": ("#4CD98A", "#1FA85A"),
        "short": "Show the room, a whiteboard or your pet live on the TV, front or back camera.",
    },
    {
        "id": "youtube", "name": "YouTube", "icon": "home_youtube", "colors": ("#FF6464", "#E62117"),
        "short": "The TV plays the video itself, in full quality, from where you were.",
    },
    {
        "id": "web-videos", "name": "Web videos", "icon": "home_web_videos", "colors": ("#FFB547", "#F57C00"),
        "short": "Open a site, play the video, tap Cast to TV. Ads blocked.",
    },
    {
        "id": "iptv", "name": "Live TV (IPTV)", "icon": "home_iptv", "colors": ("#3FD3C6", "#0E9F95"),
        "short": "9,000+ free channels from 180+ countries, plus your own M3U playlists.",
    },
    {
        "id": "web-images", "name": "Web images", "icon": "home_web_images", "colors": ("#FF7AB6", "#E33A8C"),
        "short": "Search free images from Wikimedia Commons and show them full screen.",
    },
    {
        "id": "any-browser", "name": "Any web browser", "icon": "browser", "colors": ("#A897FF", "#755CFF"),
        "short": "No TV found? Open smrr.tv on any TV or computer and type the code.",
    },
]

# Feature sections on the home page, each with app screenshots.
SHOWCASE = [
    {
        "feature": "screen-mirroring",
        "title": "Mirror your iPhone screen to the TV",
        "text": "Everything on your phone shows on the TV in real time: apps, games, photos, websites, "
                "presentations. Start it once and keep using your phone; the TV follows.",
        "points": [
            "Works in every app, and keeps going while you switch apps",
            "Sound from your apps goes to the TV, never the microphone",
            "High, Medium or Low quality: sharper, or smoother on busy Wi-Fi",
            "Auto rotate: turn the phone sideways and the TV follows",
            "A short guide shows how iOS starts it, step by step",
        ],
        "shots": [("mirroring", "MirrorGo's Screen Mirroring screen with Quality, Auto rotate and Sound settings"),
                  ("guide", "MirrorGo's guide: how screen mirroring starts, in four steps")],
        "glow": "rgba(117, 92, 255, .38)",
    },
    {
        "feature": "photos-videos",
        "title": "Your photos and videos, on the big screen",
        "text": "Pick a photo or a video and it's on the TV. Swipe to the next one and the TV follows. "
                "Videos play in their full quality, with sound, controlled from your phone.",
        "points": [
            "Photos at the TV's resolution, videos in their original quality",
            "Auto play: a slideshow (5 to 30 s a photo), videos to the end, then repeat",
            "Play, pause and seek on the phone; the TV plays it",
            "4K and HEVC videos: converted only for TVs that can't play them",
            "Straight from your phone to the TV over your Wi-Fi, never uploaded",
        ],
        "shots": [("detail_media", "Casting a photo from the iPhone gallery with MirrorGo")],
        "glow": "rgba(74, 168, 255, .32)",
    },
    {
        "feature": "iptv",
        "title": "Thousands of free live TV channels",
        "text": "Browse free, public TV channels by country or category, from news to sports, movies, music "
                "and kids, and play them on your TV with one tap. Add your own M3U playlists too.",
        "points": [
            "9,000+ channels from 180+ countries, in 29 categories",
            "Favourites one tap away",
            "Add your own M3U playlist links",
            "Keeps playing when you lock your phone or open another app",
        ],
        "shots": [("iptv", "MirrorGo's IPTV screen: playlists, categories and countries"),
                  ("channels", "Live TV channels from the United States in MirrorGo")],
        "glow": "rgba(63, 211, 198, .28)",
        "footnote": "Channels come from the public iptv-org list. Like any free streams, some are offline or "
                    "only play in their own country at times.",
    },
    {
        "feature": "web-videos",
        "title": "Cast videos from any website",
        "text": "Open a website in MirrorGo's private browser and play the video: MirrorGo finds it and sends "
                "it to the TV, which plays it in full quality while you keep browsing.",
        "points": [
            "Open any site, play the video, tap Cast to TV",
            "Picks the real video, not the ad, and blocks ad networks",
            "Picks up from where you were on the page",
            "Private browsing: no history, cookies or cache kept",
        ],
        "shots": [("webvideos", "MirrorGo's web video browser with popular sites")],
        "glow": "rgba(255, 181, 71, .26)",
    },
    {
        "feature": "youtube",
        "title": "YouTube on your TV, played by the TV",
        "text": "Browse YouTube in MirrorGo just as on your phone, then tap Cast to TV. The TV plays the "
                "video itself, in full quality, starting from where you were.",
        "points": [
            "Opens in the TV's YouTube app on Samsung and LG",
            "Plays on Google TV, Chromecast and web browsers too",
            "Keeps playing when you leave the screen",
        ],
        "shots": [("youtube", "Casting YouTube to a TV with MirrorGo")],
        "glow": "rgba(255, 100, 100, .26)",
    },
    {
        "feature": "web-images",
        "title": "Beautiful free images, full screen",
        "text": "Search free images from Wikimedia Commons (landscapes, space, cities, art) and show them on "
                "the TV in its full resolution, or as a slideshow.",
        "points": [
            "Millions of free, openly licensed images",
            "Slideshow with your own timing",
            "The author and licence shown with every image",
        ],
        "shots": [("webimage_detail", "A Wikimedia Commons landscape ready to cast with MirrorGo")],
        "glow": "rgba(255, 122, 182, .26)",
    },
    {
        "feature": "any-browser",
        "title": "No smart TV app? Use any web browser",
        "text": "Any TV, computer or tablet with a web browser can show your iPhone, even one MirrorGo doesn't "
                "find. Open smrr.tv on it, then type the 6-digit code it shows, or scan its QR code.",
        "points": [
            "Works on smart TVs, PCs, Macs and tablets",
            "Video goes straight over your Wi-Fi, with sound",
            "For LG and Samsung TVs nearby, MirrorGo opens the TV's browser for you",
        ],
        "shots": [("browser_code", "Entering the smrr.tv code in MirrorGo to mirror to a web browser")],
        "glow": "rgba(168, 151, 255, .30)",
    },
]

STEPS = [
    ("Join the same Wi-Fi", "Put your iPhone on the same Wi-Fi as your TV. No cables, no TV app."),
    ("Pick your TV", "MirrorGo finds the TVs around you. Tap yours; LG and Samsung TVs ask you to Allow once."),
    ("Mirror or cast", "Start screen mirroring, or open photos, videos, YouTube, a website or a TV channel."),
]

PRIVACY_POINTS = [
    ("No account", "Nothing to sign up for. Open the app and connect."),
    ("Stays on your Wi-Fi", "Photos, videos and your screen go straight from your phone to your TV. They aren't uploaded anywhere."),
    ("App sound only", "Mirroring sends the sound your apps play, never your microphone."),
    ("Private browsing", "Web Videos keeps no history, cookies or cache."),
]

# MARK: Help (the app's FAQ, Localizable.strings)

START_SHARING = "Start Sharing (Start Broadcast before iOS 26)"

FAQ_SECTIONS = [
    ("Getting started", [
        {"id": "tvs", "q": "Which TVs does MirrorGo work with?",
         "a": "Most smart TVs and streaming sticks. Nothing needs to be installed on the TV.",
         "ul": ["Samsung smart TVs (2016 and newer)", "LG smart TVs (webOS)",
                "Google TV, Android TV and Chromecast", "Amazon Fire TV: sticks, Cube and Fire TV smart TVs",
                "Apple TV and AirPlay TVs",
                "Any other TV, computer or tablet with a web browser, through smrr.tv"]},
        {"id": "connect", "q": "How do I connect to my TV?",
         "a": "Turn the TV on and make sure it's on the same Wi-Fi as your phone. Then:",
         "ol": ["Tap Connect your TV on Home, or the TV button at the top of any screen.",
                "Pick your TV from the list.",
                "LG and Samsung TVs ask the first time: choose Allow on the TV with its remote."],
         "note": "MirrorGo remembers your TV and connects to it again next time."},
    ]),
    ("Connecting", [
        {"id": "notFound", "q": "My TV isn't in the list",
         "a": "MirrorGo finds TVs on your Wi-Fi. When one is missing, it's usually one of these:",
         "ul": ["The phone and TV are on different networks. Use the same Wi-Fi, not a guest network.",
                "Local Network access is off for MirrorGo. iOS then hides every TV from the app.",
                "A VPN is on. Turn it off while you cast.",
                "The TV is asleep or stuck. Turn it on fully, or restart it and your router."],
         "note": "Still missing? Any TV with a web browser works through smrr.tv: see \"How do I mirror to a web browser?\""},
        {"id": "allow", "q": "My TV won't let MirrorGo connect",
         "a": "LG and Samsung TVs ask before a phone can control them. The first time MirrorGo connects, a message "
              "shows on the TV: choose Allow with the remote. It isn't asked again.",
         "ul": ["LG: missed it or chose Deny? Connect again and the TV asks again.",
                "Samsung: chose Deny? The TV remembers it. On the TV, open Settings › General › External Device "
                "Manager › Device Connection Manager › Device List, then allow MirrorGo or delete it so the TV asks again.",
                "Older LG TVs: turn on LG Connect Apps in the TV's network settings."]},
        {"id": "lost", "q": "The connection keeps dropping",
         "a": "iOS closes MirrorGo's link to the TV while the app is in the background, and a Wi-Fi hiccup can close "
              "it too. MirrorGo reconnects by itself in a few seconds, and screen mirroring carries on meanwhile.",
         "ul": ["See \"Lost connection\"? Check the TV is on and on the same Wi-Fi, then tap Retry.",
                "A weak signal drops more often: keep the phone and TV near the router."]},
        {"id": "browser", "q": "How do I mirror to a web browser?",
         "a": "Any TV, computer or tablet with a web browser can show your screen, even one MirrorGo doesn't find as a TV.",
         "ol": ["In its web browser, open smrr.tv. The page shows a 6-digit code.",
                "In MirrorGo, open the TV list and tap Browser (smrr.tv).",
                "Type the code, or scan the QR code on the page."],
         "note": "Keep the page open while you mirror. The phone and the browser need to be on the same Wi-Fi. "
                 "For an LG or Samsung TV nearby, \"Open on…\" opens its browser for you."},
    ]),
    ("Screen mirroring", [
        {"id": "mirror", "q": "How do I mirror my screen?",
         "ol": ["Connect your TV, then open Screen Mirroring.",
                f"Tap Start mirroring. iOS asks you to confirm: tap {START_SHARING}.",
                "After its 3-second countdown, tap outside the box to close it.",
                "Wait 5–10 seconds for the TV. Don't stop and start again: that starts it over."],
         "note": "To stop, tap Stop mirroring, or the red indicator at the top of your screen."},
        {"id": "airPlay", "q": "How do I mirror to an Apple TV or AirPlay TV?",
         "a": "iOS mirrors to AirPlay devices itself, so it starts from Control Center, not from an app:",
         "ol": ["Swipe down from the top-right corner to open Control Center.", "Tap Screen Mirroring.",
                "Choose your Apple TV or AirPlay TV."],
         "note": "To stop, tap Screen Mirroring again, then Stop Mirroring."},
        {"id": "nothingShows", "q": "Mirroring started, but the TV shows nothing",
         "ul": ["Give the TV up to 10 seconds. Stopping and starting again only starts it over.",
                "Check it's the right TV: its name is at the top of Screen Mirroring.",
                "Mirroring to a web browser? Keep smrr.tv open there, on the same Wi-Fi as the phone.",
                "Still nothing? Stop mirroring, restart the TV, connect again and start."]},
        {"id": "black", "q": "Some apps show as a black screen",
         "a": "Netflix, Prime Video, Disney+ and other streaming apps protect their videos, so iOS sends a black "
              "picture instead. No mirroring app can get around it.",
         "note": "Use the app's own cast button if it has one. For YouTube, open YouTube in MirrorGo: the TV plays the video itself."},
        {"id": "sound", "q": "There's no sound on the TV",
         "ul": ["Check Sound is on in Screen Mirroring, and the TV isn't muted.",
                "MirrorGo sends the sound your apps play, never the microphone.",
                "Fire TV and some older LG TVs show the picture without sound.",
                "Some apps don't let their sound be recorded, so it stays on the phone."]},
        {"id": "lag", "q": "Mirroring lags or looks blurry",
         "a": "Mirroring always runs a little behind your phone. How much depends on the TV and your Wi-Fi.",
         "ul": ["Pick a lower Quality before you start for a smoother picture, or a higher one for a sharper one.",
                "Move closer to the router, or use its 5 GHz network.",
                "Watching a video? Cast it instead (Gallery, Web Videos, YouTube): the TV plays it in full quality, "
                "with the sound in sync."]},
    ]),
    ("Casting", [
        {"id": "whatCast", "q": "What can I cast besides my screen?",
         "a": "Photos and videos from your gallery, your camera, videos and images from the web, TV channels (IPTV) "
              "and YouTube. Not every TV plays everything: on Home, what your TV can't play is dimmed.",
         "ul": ["YouTube doesn't play on Fire TV or over AirPlay.",
                "Over AirPlay, the camera needs Screen Mirroring on in Control Center.",
                "Fire TV and AirPlay show the camera without sound."]},
        {"id": "lgCheck", "q": "My LG TV asks \"Is it playing on your TV?\"",
         "a": "On LG TVs, MirrorGo first plays photos, videos and channels in the TV's web browser, which plays the "
              "most. A few seconds in, it asks if it works:",
         "ul": ["Yes: carry on, it isn't asked again on that screen.",
                "No: MirrorGo closes the browser, plays it with the TV's own player instead and asks again.",
                "Still not working? Tap Email support and tell us your TV's model."]},
        {"id": "webVideo", "q": "A web video won't cast",
         "ul": ["Play the video on the page first: Cast to TV turns on once MirrorGo finds it.",
                "More than one found? Pick the right one from the list (\"1 of 3\").",
                "Very short clips aren't cast, so ads don't end up on the TV.",
                "Some sites protect their videos, like Netflix does. Those can't be cast.",
                "Keep MirrorGo open while it plays: the video goes through your phone."]},
        {"id": "iptv", "q": "A TV channel doesn't play",
         "a": "Channels are free public streams. At any moment some are offline, or only play in their own country. "
              "If one doesn't start, try another.",
         "note": "Channels keep playing when you leave the list or lock your phone. Stop them from the bar at the bottom of Home."},
        {"id": "background", "q": "Can I use my phone while casting?",
         "ul": ["Screen mirroring: yes. Everything on your screen shows on the TV, in any app.",
                "TV channels and YouTube keep playing on the TV when you leave them.",
                "Gallery, camera and web videos stop when you close their screen."]},
    ]),
    ("Permissions", [
        {"id": "localNetwork", "q": "Why does MirrorGo need Local Network access?",
         "a": "MirrorGo talks to your TV over your Wi-Fi, and iOS only allows that with Local Network access. "
              "Without it, no TV can be found or cast to. It's only used for devices on your own network.",
         "ol": ["Tap Open Settings", "Turn on Local Network", "Come back to MirrorGo"]},
        {"id": "permissions", "q": "What are Photos, Camera and Microphone for?",
         "ul": ["Photos: to show and cast your photos and videos. With limited access, only the ones you picked show up.",
                "Camera: to cast your camera, and to scan the code on smrr.tv.",
                "Microphone: sound when you cast your camera."],
         "note": "Your photos and videos go straight from your phone to the TV over your Wi-Fi. They aren't uploaded anywhere."},
        {"id": "denied", "q": "I said no to a permission. How do I turn it on?",
         "a": "iOS asks only once. To change your answer, open Settings, tap MirrorGo and turn on Local Network, "
              "Photos, Camera or Microphone."},
    ]),
    ("Something else", [
        {"id": "problem", "q": "Something else isn't working",
         "a": "Update MirrorGo to the latest version and restart the TV. If that doesn't help, tap Contact us in "
              "the app's Help. The email already has your app version, iOS version, phone model and kind of TV; "
              "please add your TV's model."},
    ]),
]

# The questions on the home page (ids from FAQ_SECTIONS), the rest on /help/.
HOME_FAQ = ["tvs", "connect", "mirror", "browser", "airPlay", "black", "sound", "whatCast", "iptv", "localNetwork"]

# MARK: TV guides

# status: "ok" works, "part" works with a limit (detail says which), "not" doesn't.
TV_GUIDES = [
    {
        "tv": "samsung",
        "slug": "mirror-iphone-to-samsung-tv",
        "title": "How to Mirror an iPhone to a Samsung TV (No Cables, No TV App)",
        "description": "Mirror your iPhone screen to a Samsung smart TV over Wi-Fi with MirrorGo, and cast photos, "
                       "videos, YouTube and live TV. Works with Samsung TVs from 2016 on, nothing to install on the TV.",
        "h1": "Mirror your iPhone to a Samsung TV",
        "lead": "MirrorGo shows your iPhone screen on Samsung smart TVs (Tizen, 2016 and newer) over your Wi-Fi. "
                "Nothing to install on the TV: it plays in the TV's own player, with sound.",
        "steps": [
            "Turn on your Samsung TV and put your iPhone on the same Wi-Fi.",
            "Open MirrorGo, tap Connect your TV and pick your Samsung TV.",
            "The first time, choose Allow on the TV with the remote.",
            f"Open Screen Mirroring, tap Start mirroring, then {START_SHARING}. Your screen shows on the TV in 5–10 seconds.",
        ],
        "features": [
            ("Screen mirroring", "ok", "With sound; Quality, Sound and Auto rotate settings"),
            ("Photos & videos", "ok", "Played by the TV, 4K and HEVC included where the TV supports them"),
            ("Camera", "ok", "With sound"),
            ("YouTube", "ok", "Opens in the TV's own YouTube app"),
            ("Web videos", "ok", None),
            ("Live TV channels", "ok", None),
            ("Web images", "ok", None),
        ],
        "sections": [
            ("Which Samsung TVs work?",
             ["Samsung smart TVs running Tizen, from 2016 models on, such as the Crystal UHD, QLED, Neo QLED, OLED and The "
              "Frame ranges. MirrorGo finds them on your Wi-Fi by themselves, with no app on the TV.",
              "Many Samsung TVs from 2018 on also support AirPlay. MirrorGo works with or without it, and adds "
              "casting from websites, live TV channels and YouTube on top."]),
            ("If the TV doesn't let MirrorGo connect",
             ["Samsung TVs ask before a phone can control them. If you chose Deny, the TV remembers it: on the TV "
              "open Settings › General › External Device Manager › Device Connection Manager › Device List, then "
              "allow MirrorGo or delete it so the TV asks again."]),
            ("Smoother mirroring",
             ["Mirroring always runs a little behind your phone, more on busy Wi-Fi. Pick a lower Quality for a "
              "smoother picture, keep the phone near the router, or cast videos instead of mirroring them: the TV "
              "then plays them in full quality, with the sound in sync."]),
        ],
        "faq": [
            ("Do I need to install an app on my Samsung TV?",
             "No. MirrorGo uses what's built into Samsung smart TVs: the TV's media player and its remote control "
             "connection. You only install MirrorGo on your iPhone."),
            ("Is there sound when I mirror my iPhone to a Samsung TV?",
             "Yes. The sound your apps play goes to the TV with the picture; turn Sound on in Screen Mirroring. "
             "MirrorGo never sends your microphone."),
            ("Can I mirror Netflix or Disney+ to my Samsung TV?",
             "No mirroring app can: streaming apps protect their videos and iOS sends a black picture instead. "
             "Use the app's own cast button, or its app on the TV."),
        ],
    },
    {
        "tv": "lg",
        "slug": "mirror-iphone-to-lg-tv",
        "title": "How to Mirror an iPhone to an LG TV (webOS, No Cables)",
        "description": "Mirror your iPhone to an LG smart TV (webOS) over Wi-Fi with MirrorGo, and cast photos, videos, "
                       "YouTube and live TV channels. No app to install on the TV.",
        "h1": "Mirror your iPhone to an LG TV",
        "lead": "MirrorGo shows your iPhone screen on LG smart TVs (webOS) over your Wi-Fi. On newer LG TVs it "
                "uses LG's own screen sharing; older ones show your screen in the TV's web browser. Nothing to install.",
        "steps": [
            "Turn on your LG TV and put your iPhone on the same Wi-Fi.",
            "Open MirrorGo, tap Connect your TV and pick your LG TV.",
            "The first time, choose Allow on the TV with the remote.",
            f"Open Screen Mirroring, tap Start mirroring, then {START_SHARING}. Your screen shows on the TV in 5–10 seconds.",
        ],
        "features": [
            ("Screen mirroring", "ok", "With sound on most LG TVs (some older ones show the picture only)"),
            ("Photos & videos", "ok", None),
            ("Camera", "ok", None),
            ("YouTube", "ok", "Opens in the TV's own YouTube app"),
            ("Web videos", "ok", None),
            ("Live TV channels", "ok", None),
            ("Web images", "ok", None),
        ],
        "sections": [
            ("Which LG TVs work?",
             ["LG smart TVs running webOS. On webOS 22 and newer, MirrorGo uses LG's own screen sharing (LG Cast). "
              "Older LG TVs, from webOS 4 (2018) on, show your screen in the TV's web browser, which MirrorGo opens "
              "for you."]),
            ("If the TV doesn't let MirrorGo connect",
             ["LG TVs ask before a phone can control them. Missed the message or chose Deny? Connect again and the "
              "TV asks again. On older LG TVs, turn on LG Connect Apps in the TV's network settings."]),
            ("\"Is it playing on your TV?\"",
             ["On LG TVs, MirrorGo first plays photos, videos and channels in the TV's web browser, which plays the "
              "most. A few seconds in, it asks if it works. Tap No and it switches to the TV's own player instead."]),
        ],
        "faq": [
            ("Do I need to install an app on my LG TV?",
             "No. MirrorGo uses what's built into LG webOS TVs: LG's screen sharing, the TV's web browser and its "
             "media player. You only install MirrorGo on your iPhone."),
            ("Why doesn't my LG TV play sound when mirroring?",
             "Most LG TVs play your apps' sound. Some older models show the picture without sound; to watch a video "
             "with sound there, cast it (Photos & videos, Web videos or YouTube) instead of mirroring it."),
            ("Does MirrorGo work with LG TVs that don't support AirPlay?",
             "Yes. MirrorGo doesn't need AirPlay: it works with LG webOS TVs from 2018 on."),
        ],
    },
    {
        "tv": "google",
        "slug": "mirror-iphone-to-chromecast",
        "title": "How to Mirror an iPhone to Chromecast & Google TV",
        "description": "Mirror your iPhone screen to Chromecast, Google TV and Android TV with MirrorGo, and cast photos, "
                       "videos, YouTube and live TV channels over Wi-Fi.",
        "h1": "Mirror your iPhone to Chromecast and Google TV",
        "lead": "MirrorGo shows your iPhone screen on Chromecast, Google TV and Android TV, including TVs with "
                "Chromecast built in from Sony, TCL, Hisense, Philips and others. Nothing to install on the TV.",
        "steps": [
            "Turn on the TV and put your iPhone on the same Wi-Fi as the Chromecast or Google TV.",
            "Open MirrorGo, tap Connect your TV and pick your Chromecast or Google TV.",
            f"Open Screen Mirroring, tap Start mirroring, then {START_SHARING}.",
            "Your screen shows on the TV in a few seconds.",
        ],
        "features": [
            ("Screen mirroring", "ok", "With sound"),
            ("Photos & videos", "ok", None),
            ("Camera", "ok", "With sound"),
            ("YouTube", "ok", "Played by the TV, from where you were"),
            ("Web videos", "ok", None),
            ("Live TV channels", "ok", None),
            ("Web images", "ok", None),
        ],
        "sections": [
            ("Which devices work?",
             ["Chromecast (with or without Google TV), Google TV Streamer, and Android TV / Google TV smart TVs "
              "with Chromecast built in. MirrorGo finds them on your Wi-Fi the way Google's own apps do."]),
            ("If your Chromecast isn't listed",
             ["Make sure the phone and the Chromecast are on the same Wi-Fi (not a guest network), that MirrorGo "
              "has Local Network access in Settings, and that no VPN is on. Still missing? Open smrr.tv in a "
              "browser on any screen and mirror there."]),
        ],
        "faq": [
            ("Can I mirror my whole iPhone screen to a Chromecast?",
             "Yes. iPhones can't do it on their own, since Chromecast doesn't support AirPlay, but MirrorGo mirrors "
             "your whole screen, with sound, to Chromecast and Google TV."),
            ("Do I need the Google Home app?",
             "No. Your Chromecast only needs to be set up and on your Wi-Fi. MirrorGo connects to it directly."),
        ],
    },
    {
        "tv": "firetv",
        "slug": "mirror-iphone-to-fire-tv",
        "title": "How to Mirror an iPhone to a Fire TV Stick (No App on the Fire TV)",
        "description": "Mirror your iPhone to an Amazon Fire TV Stick, Fire TV Cube or Fire TV smart TV with MirrorGo, "
                       "with nothing to install on the Fire TV. Cast photos, videos and live TV too.",
        "h1": "Mirror your iPhone to a Fire TV",
        "lead": "MirrorGo shows your iPhone on Fire TV Sticks, the Fire TV Cube and Fire TV smart TVs, using the "
                "player built into every Fire TV. Nothing to install on the Fire TV.",
        "steps": [
            "Turn on the Fire TV and put your iPhone on the same Wi-Fi.",
            "Open MirrorGo, tap Connect your TV and pick your Fire TV.",
            f"Open Screen Mirroring, tap Start mirroring, then {START_SHARING}.",
            "Your screen shows on the TV. To stop, tap Stop mirroring, or press Home on the Fire TV remote.",
        ],
        "features": [
            ("Screen mirroring", "part", "Picture only, no sound"),
            ("Photos & videos", "ok", "Videos with sound"),
            ("Camera", "part", "Picture only, no sound"),
            ("YouTube", "not", "Use the YouTube app on the Fire TV"),
            ("Web videos", "ok", "With sound"),
            ("Live TV channels", "ok", "With sound; keep playing without the phone"),
            ("Web images", "ok", None),
        ],
        "sections": [
            ("Which Fire TVs work?",
             ["Fire TV Sticks (including the 4K and 4K Max), the Fire TV Cube, and smart TVs with Fire TV built in "
              "(Amazon, Toshiba, Insignia and others). MirrorGo finds them on your Wi-Fi."]),
            ("Watching videos with sound",
             ["Mirroring a Fire TV shows the picture without sound. To watch a video with sound, cast it instead: "
              "photos and videos from your gallery, web videos and live TV channels all play with sound."]),
        ],
        "faq": [
            ("Do I need to install an app on my Fire TV?",
             "No. Every Fire TV has a media player built in, and MirrorGo uses it. You only install MirrorGo on your iPhone."),
            ("Can I mirror an iPhone to a Fire TV Stick with sound?",
             "Screen mirroring shows the picture only. Videos you cast (gallery, web videos, live TV channels) play "
             "with sound."),
        ],
    },
    {
        "tv": "browser",
        "slug": "mirror-iphone-to-browser",
        "title": "Mirror an iPhone to Any TV or Computer Through a Web Browser (smrr.tv)",
        "description": "Mirror your iPhone to any smart TV, PC, Mac or tablet with a web browser: open smrr.tv, "
                       "type the 6-digit code in MirrorGo, done. No app on the TV or computer.",
        "h1": "Mirror your iPhone to any screen with a web browser",
        "lead": "Any TV, computer or tablet with a web browser can show your iPhone, even a TV MirrorGo doesn't "
                "find. Open smrr.tv there, type its code in MirrorGo, and your screen is on it, with sound.",
        "steps": [
            "On the TV or computer, open smrr.tv in its web browser. The page shows a 6-digit code and a QR code.",
            "In MirrorGo, open the TV list and tap Mirror to a web browser.",
            "Type the code, or scan the QR code.",
            f"Open Screen Mirroring, tap Start mirroring, then {START_SHARING}.",
        ],
        "features": [
            ("Screen mirroring", "ok", "With sound"),
            ("Photos & videos", "ok", None),
            ("Camera", "ok", None),
            ("YouTube", "ok", None),
            ("Web videos", "ok", None),
            ("Live TV channels", "ok", "The browser plays the channel itself"),
            ("Web images", "ok", None),
        ],
        "sections": [
            ("What works as a screen",
             ["Smart TVs with a modern web browser, Windows PCs, Macs, Chromebooks and tablets, with a recent "
              "browser such as Chrome, Edge, Safari or Firefox."]),
            ("Private and direct",
             ["The video goes straight from your iPhone to the browser over your Wi-Fi. smrr.tv only introduces "
              "the two; your screen isn't sent through it. That's why both need to be on the same Wi-Fi."]),
            ("Tips",
             ["Keep the smrr.tv page open while you mirror. Reloading it reconnects by itself.",
              "For an LG or Samsung TV nearby, MirrorGo's \"Open on…\" button opens the TV's browser for you."]),
        ],
        "faq": [
            ("Do I need to install anything on the TV or computer?",
             "No, only a web browser. Open smrr.tv and type the code it shows into MirrorGo."),
            ("Can someone else see my screen with my code?",
             "To connect, a phone needs the code shown on that screen, so someone has to be looking at it. The "
             "video itself only travels over your own Wi-Fi."),
        ],
    },
]
