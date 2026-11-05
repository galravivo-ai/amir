# Ad videos (Facebook / Instagram)

`node tools/ad-video/build.cjs <outDir> [variant] [format]` renders `ad.html` frame by frame
(Playwright + ffmpeg) into `GoFive-ad-<variant>-<9x16|4x5>.mp4`.

- Variants: `general`, `restaurant`, `salon`, `garage` (texts in `build.cjs`). The businesses are samples, labeled as such in the video.
- Formats: `story` 1080×1920 (Stories, Reels) and `feed` 1080×1350 (feed).
- `dashboard-m.png` is a phone screenshot of the demo dashboard; retake it when the dashboard changes.
- The output is not committed; rebuild it when needed.
