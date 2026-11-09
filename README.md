# YouTube Metadata, Captions, and Video Downloader

A full-stack web application that extracts rich metadata, timestamped captions/transcripts, and high-quality video/audio streams from any YouTube URL using **FastAPI**, **yt-dlp**, and **ffmpeg**.

---

## 🚀 Prerequisites & System Dependencies

### 1. Python 3.10+
Ensure Python and `pip` are installed on your system.

### 2. FFmpeg Installation (Required for Stream Merging & MP3 Audio Extraction)
`yt-dlp` uses `ffmpeg` to multiplex separate high-definition video (1080p, 4K) and audio streams into single `.mp4` containers, as well as converting audio to `.mp3`.

- **macOS (Homebrew)**:
  ```bash
  brew install ffmpeg
  ```

- **Ubuntu / Debian Linux**:
  ```bash
  sudo apt update
  sudo apt install -y ffmpeg
  ```

- **Arch Linux**:
  ```bash
  sudo pacman -S ffmpeg
  ```

- **Windows**:
  - Using Windows Package Manager (winget):
    ```powershell
    winget install Gyan.FFmpeg
    ```
  - Using Chocolatey:
    ```powershell
    choco install ffmpeg
    ```
  - Or download the static build from [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) and add its `bin` directory to your System `PATH`.

Verify your installation:
```bash
ffmpeg -version
```

---

## 🛠 Backend Setup (FastAPI & yt-dlp)

1. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the FastAPI Server**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **API Documentation**:
   Once running, explore interactive Swagger docs at:
   - `http://localhost:8000/docs`
   - `http://localhost:8000/redoc`

---

## 📡 API Endpoints Reference

### 1. Health Check
- `GET /api/health`
- Returns system diagnostic information: yt-dlp version, ffmpeg presence, and runtime status.

### 2. Metadata Extraction
- `POST /api/info`
- **Request Body**:
  ```json
  {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
  ```
- **Returns**: Video title, channel/uploader name, channel URL, duration (seconds & formatted), high-res thumbnail preview, upload date, view count, tags, full description, list of available resolutions, and available subtitles/captions.

### 3. Captions & Transcript Extraction
- `GET /api/captions?url=<YOUTUBE_URL>&lang=en&download_as=<txt|srt>`
- Checks manual subtitles first, then falls back to auto-generated captions (`automatic_captions`).
- Supports JSON output with timestamped cues (`[00:15] ...`), plain text transcript download (`.txt`), and SubRip subtitle file download (`.srt`).

### 4. Video & Audio Download
- `POST /api/download`
- **Request Body**:
  ```json
  {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format_id": "best"
  }
  ```
- **Format Options**:
  - `best`: Highest available MP4 video multiplexed with audio.
  - `1080p`: 1080p Full HD MP4.
  - `720p`: 720p HD MP4.
  - `480p`: 480p standard definition MP4.
  - `audio_mp3`: 192kbps MP3 audio file.
  - `audio_m4a`: Original AAC audio stream.
- Streams the downloaded file directly to the browser with proper `Content-Disposition` attachment headers and automatically cleans up temporary files on disk.

---

## 💻 Full-Stack Development Mode (Vite & React)

To run the unified frontend and backend in development:
```bash
npm install
npm run dev
```
Open `http://localhost:3000` to interact with the application.
