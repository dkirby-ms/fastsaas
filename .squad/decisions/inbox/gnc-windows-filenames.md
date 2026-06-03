### 2026-06-03T13:51:10Z: Windows-compatible timestamps in filenames
**By:** GNC (via Squad)
**What:** All `.squad/` log/orchestration filenames must use hyphens instead of colons in timestamps (e.g., `2026-05-31T21-35-32.766Z` not `2026-05-31T21:35:32.766Z`). Colons are illegal on NTFS/Windows.
**Why:** User reported `git pull` failures on Windows due to invalid paths.
