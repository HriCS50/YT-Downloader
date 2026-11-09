"""
YouTube Metadata, Captions, and Video Downloader API
Powered by FastAPI, yt-dlp, and ffmpeg
"""

import os
import re
import json
import shutil
import tempfile
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, JSONResponse
from pydantic import BaseModel
import yt_dlp

# YouTube URL regex matching watch, shortened, shorts, embeds, and mobile links
YOUTUBE_URL_REGEX = re.compile(
    r'^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&].*)?$'
)

app = FastAPI(
    title="YouTube Metadata & Media Extractor API",
    description="FastAPI service for extracting YouTube metadata, captions/transcripts, and streaming media downloads using yt-dlp and ffmpeg.",
    version="1.0.0"
)

# Allow CORS for development and cross-origin clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = "best"  # best, 1080p, 720p, 480p, audio_mp3, audio_m4a

def check_ffmpeg_installed() -> bool:
    """Checks whether ffmpeg executable is available in PATH."""
    return shutil.which("ffmpeg") is not None

def validate_youtube_url(url: str) -> str:
    """Validates YouTube URL and returns the 11-char video ID, or raises 400."""
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="A valid YouTube URL is required.")
    
    match = YOUTUBE_URL_REGEX.match(url.strip())
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please provide a standard watch URL, youtu.be link, or Shorts URL."
        )
    return match.group(1)

def get_base_ydl_opts() -> Dict[str, Any]:
    """Returns standard yt-dlp extraction options."""
    opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "format": None,
        "noplaylist": True,
        "extract_flat": False,
    }
    if shutil.which("node"):
        opts["js_runtimes"] = {"node": {}}
    return opts

def sanitize_filename(name: str) -> str:
    """Sanitizes video title for safe file naming."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = clean.strip().replace(" ", "_")
    return clean[:100] or "youtube_media"

def format_seconds(seconds: Optional[float]) -> str:
    """Formats seconds into HH:MM:SS or MM:SS."""
    if seconds is None or seconds < 0:
        return "00:00"
    total_sec = int(seconds)
    hrs = total_sec // 3600
    mins = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

def to_srt_timestamp(seconds: float) -> str:
    """Formats seconds into standard SubRip timestamp (HH:MM:SS,mmm)."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

def cleanup_file_and_dir(filepath: str, dirpath: str):
    """Background task to remove temporary download file and directory."""
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception as e:
        print(f"Error removing file {filepath}: {e}")
    try:
        if os.path.exists(dirpath):
            shutil.rmtree(dirpath, ignore_errors=True)
    except Exception as e:
        print(f"Error removing directory {dirpath}: {e}")

@app.get("/api/health")
def health_check():
    """Returns health status, yt-dlp version, and ffmpeg installation check."""
    return {
        "status": "healthy",
        "yt_dlp_version": yt_dlp.version.__version__,
        "ffmpeg_installed": check_ffmpeg_installed(),
        "node_installed": shutil.which("node") is not None,
    }

@app.post("/api/info")
def extract_metadata(payload: InfoRequest):
    """
    Extracts comprehensive metadata for a YouTube URL using yt-dlp.
    Does not download the video file.
    """
    video_id = validate_youtube_url(payload.url)
    ydl_opts = get_base_ydl_opts()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(payload.url.strip(), download=False)
    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        if "Private video" in msg:
            raise HTTPException(status_code=403, detail="This video is private.")
        if "Sign in to confirm your age" in msg or "age" in msg.lower():
            raise HTTPException(status_code=403, detail="This video is age-restricted and requires sign-in.")
        if "Video unavailable" in msg:
            raise HTTPException(status_code=404, detail="This YouTube video is unavailable or has been removed.")
        raise HTTPException(status_code=400, detail=f"Failed to extract video info: {msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected extraction error: {str(e)}")

    if not info:
        raise HTTPException(status_code=404, detail="No metadata could be extracted.")

    # Extract thumbnails
    thumbnails = info.get("thumbnails", [])
    best_thumbnail = info.get("thumbnail")
    if not best_thumbnail and thumbnails:
        best_thumbnail = thumbnails[-1].get("url")

    # Extract available subtitles & automatic captions
    subtitles = info.get("subtitles", {})
    auto_captions = info.get("automatic_captions", {})
    
    available_tracks = []
    # Manual tracks
    for lang, tracks in subtitles.items():
        track_name = tracks[0].get("name", lang) if tracks else lang
        available_tracks.append({
            "code": lang,
            "name": f"{track_name} (Manual)",
            "is_generated": False
        })
    # Auto-generated tracks
    for lang, tracks in auto_captions.items():
        if lang not in subtitles:
            track_name = tracks[0].get("name", lang) if tracks else lang
            available_tracks.append({
                "code": lang,
                "name": f"{track_name} (Auto-generated)",
                "is_generated": True
            })

    # Available formats/resolutions summary
    formats = info.get("formats", [])
    seen_heights = set()
    available_resolutions = []
    has_audio = False

    for f in formats:
        height = f.get("height")
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")

        if acodec != "none" and vcodec == "none":
            has_audio = True

        if height and height not in seen_heights and vcodec != "none":
            seen_heights.add(height)
            note = f.get("format_note") or f"{height}p"
            fps = f.get("fps")
            fps_str = f" {fps}fps" if fps and fps > 30 else ""
            available_resolutions.append({
                "height": height,
                "label": f"{note}{fps_str}",
                "ext": f.get("ext", "mp4"),
                "filesize": f.get("filesize") or f.get("filesize_approx")
            })

    # Sort resolutions descending
    available_resolutions.sort(key=lambda x: x["height"], reverse=True)

    return {
        "id": info.get("id", video_id),
        "url": payload.url.strip(),
        "webpage_url": info.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}",
        "title": info.get("title", "Untitled Video"),
        "channel": info.get("channel") or info.get("uploader") or "Unknown Channel",
        "channel_url": info.get("channel_url") or info.get("uploader_url"),
        "channel_id": info.get("channel_id") or info.get("uploader_id"),
        "duration": info.get("duration"),
        "duration_formatted": format_seconds(info.get("duration")),
        "thumbnail": best_thumbnail,
        "upload_date": info.get("upload_date"),
        "description": info.get("description", "") or "",
        "view_count": info.get("view_count"),
        "like_count": info.get("like_count"),
        "tags": info.get("tags") or [],
        "categories": info.get("categories") or [],
        "available_subtitles": available_tracks,
        "available_resolutions": available_resolutions,
        "has_audio": has_audio,
        "ffmpeg_installed": check_ffmpeg_installed()
    }

@app.get("/api/captions")
def get_captions(
    url: str = Query(..., description="YouTube video URL"),
    lang: str = Query("en", description="Target subtitle language code (e.g. 'en')"),
    download_as: Optional[str] = Query(None, description="Download as 'txt' or 'srt'")
):
    """
    Extracts captions/transcript for a YouTube video.
    Checks manual subtitles first, then falls back to auto-generated captions.
    Supports viewing or downloading as .txt or .srt.
    """
    video_id = validate_youtube_url(url)
    ydl_opts = get_base_ydl_opts()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url.strip(), download=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch video subtitles: {str(e)}")

    subtitles = info.get("subtitles", {})
    auto_captions = info.get("automatic_captions", {})

    target_lang = lang.lower()
    selected_track_list = None
    selected_lang = lang
    is_generated = False

    # 1. Search in manual subtitles
    for candidate_lang in [target_lang, target_lang.split("-")[0], "en", "en-US", "en-GB"]:
        if candidate_lang in subtitles:
            selected_track_list = subtitles[candidate_lang]
            selected_lang = candidate_lang
            is_generated = False
            break

    # 2. Fall back to automatic captions
    if not selected_track_list:
        for candidate_lang in [target_lang, target_lang.split("-")[0], "en", "en-US"]:
            if candidate_lang in auto_captions:
                selected_track_list = auto_captions[candidate_lang]
                selected_lang = candidate_lang
                is_generated = True
                break

    # 3. If still not found, check if any subtitles exist at all
    if not selected_track_list:
        if subtitles:
            first_key = next(iter(subtitles.keys()))
            selected_track_list = subtitles[first_key]
            selected_lang = first_key
            is_generated = False
        elif auto_captions:
            first_key = next(iter(auto_captions.keys()))
            selected_track_list = auto_captions[first_key]
            selected_lang = first_key
            is_generated = True

    if not selected_track_list:
        raise HTTPException(
            status_code=404,
            detail="No captions or transcripts were found for this video. Captions may be disabled by the creator."
        )

    # Prioritize format: json3 > vtt > srv3 / ttml
    track_item = (
        next((t for t in selected_track_list if t.get("ext") == "json3"), None)
        or next((t for t in selected_track_list if t.get("ext") == "vtt"), None)
        or selected_track_list[0]
    )

    track_url = track_item.get("url")
    track_ext = track_item.get("ext")

    if not track_url:
        raise HTTPException(status_code=500, detail="Subtitle track URL is missing.")

    # Fetch track data
    try:
        req = urllib.request.Request(
            track_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            raw_content = response.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to download subtitle content from YouTube: {str(e)}")

    segments: List[Dict[str, Any]] = []

    # Parse JSON3 format
    if track_ext == "json3" or raw_content.strip().startswith("{"):
        try:
            data = json.loads(raw_content)
            events = data.get("events", [])
            for ev in events:
                start_ms = ev.get("tStartMs", 0)
                duration_ms = ev.get("dDurationMs", 0)
                end_ms = start_ms + duration_ms
                start_sec = start_ms / 1000.0
                end_sec = end_ms / 1000.0

                segs = ev.get("segs", [])
                text = "".join(s.get("utf8", "") for s in segs).strip()

                text = re.sub(r'\s+', ' ', text).strip()
                if text and text != "\n":
                    segments.append({
                        "start": round(start_sec, 2),
                        "start_formatted": format_seconds(start_sec),
                        "end": round(end_sec, 2),
                        "end_formatted": format_seconds(end_sec),
                        "text": text
                    })
        except Exception as e:
            print(f"Error parsing json3: {e}")

    # Fall back or parse VTT / SRT if json3 didn't yield segments
    if not segments and ("-->" in raw_content or "WEBVTT" in raw_content):
        pattern = re.compile(
            r'(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})[^\r\n]*\r?\n([\s\S]*?)(?=(?:\r?\n\r?\n|\Z))'
        )
        for match in pattern.finditer(raw_content):
            sh1, sm1, ss1, sms1, eh2, em2, es2, ems2, text_chunk = match.groups()
            s_hrs = int(sh1) if sh1 else 0
            start_sec = s_hrs * 3600 + int(sm1) * 60 + int(ss1) + int(sms1) / 1000.0

            e_hrs = int(eh2) if eh2 else 0
            end_sec = e_hrs * 3600 + int(em2) * 60 + int(es2) + int(ems2) / 1000.0

            clean_text = re.sub(r'<[^>]+>', '', text_chunk)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()

            if clean_text:
                segments.append({
                    "start": round(start_sec, 2),
                    "start_formatted": format_seconds(start_sec),
                    "end": round(end_sec, 2),
                    "end_formatted": format_seconds(end_sec),
                    "text": clean_text
                })

    if not segments:
        raise HTTPException(status_code=404, detail="Subtitle track was located, but no readable transcript cues could be parsed.")

    # Deduplicate consecutive identical segments
    deduped_segments: List[Dict[str, Any]] = []
    for s in segments:
        if deduped_segments and deduped_segments[-1]["text"] == s["text"]:
            deduped_segments[-1]["end"] = s["end"]
            deduped_segments[-1]["end_formatted"] = s["end_formatted"]
        else:
            deduped_segments.append(s)

    plain_text_lines = [f"[{s['start_formatted']}] {s['text']}" for s in deduped_segments]
    plain_text = "\n".join(plain_text_lines)

    srt_blocks = []
    for idx, s in enumerate(deduped_segments, start=1):
        s_srt = to_srt_timestamp(s["start"])
        e_srt = to_srt_timestamp(s["end"])
        srt_blocks.append(f"{idx}\n{s_srt} --> {e_srt}\n{s['text']}\n")
    srt_text = "\n".join(srt_blocks)

    video_title = info.get("title", f"youtube_{video_id}")
    safe_title = sanitize_filename(video_title)

    if download_as == "txt":
        return Response(
            content=plain_text,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}_transcript.txt"'}
        )
    elif download_as == "srt":
        return Response(
            content=srt_text,
            media_type="application/x-subrip; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.srt"'}
        )

    return {
        "video_id": video_id,
        "title": video_title,
        "language": selected_lang,
        "is_generated": is_generated,
        "total_segments": len(deduped_segments),
        "segments": deduped_segments,
        "plain_text": plain_text,
        "srt_text": srt_text,
    }

@app.post("/api/download")
def download_video(payload: DownloadRequest, background_tasks: BackgroundTasks):
    """
    Downloads and streams the requested resolution or audio format to user's browser.
    Utilizes ffmpeg for merging streams if needed.
    """
    video_id = validate_youtube_url(payload.url)
    format_choice = payload.format_id or "best"

    has_ffmpeg = check_ffmpeg_installed()

    temp_dir = tempfile.mkdtemp(prefix="ytdl_")
    out_template = os.path.join(temp_dir, "%(title)s [%(id)s].%(ext)s")

    ydl_opts: Dict[str, Any] = {
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "windowsfilenames": True,
    }

    if shutil.which("node"):
        ydl_opts["js_runtimes"] = {"node": {}}

    if format_choice == "audio_mp3":
        ydl_opts["format"] = "bestaudio/best"
        if has_ffmpeg:
            ydl_opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }]
    elif format_choice == "audio_m4a":
        ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio/best"
    elif format_choice == "1080p":
        ydl_opts["format"] = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
        ydl_opts["merge_output_format"] = "mp4"
    elif format_choice == "720p":
        ydl_opts["format"] = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        ydl_opts["merge_output_format"] = "mp4"
    elif format_choice == "480p":
        ydl_opts["format"] = "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best"
        ydl_opts["merge_output_format"] = "mp4"
    else:  # best
        ydl_opts["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best"
        ydl_opts["merge_output_format"] = "mp4"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            extract_data = ydl.extract_info(payload.url.strip(), download=True)
    except yt_dlp.utils.DownloadError as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Download failed: {str(e)}")
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Unexpected download error: {str(e)}")

    files = [f for f in os.listdir(temp_dir) if not f.endswith(".part") and not f.endswith(".ytdl")]
    if not files:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Downloaded file was not created on disk.")

    downloaded_filename = files[0]
    filepath = os.path.join(temp_dir, downloaded_filename)

    ext = os.path.splitext(downloaded_filename)[1].lower()
    media_type = "application/octet-stream"
    if ext == ".mp4":
        media_type = "video/mp4"
    elif ext == ".mp3":
        media_type = "audio/mpeg"
    elif ext in [".m4a", ".aac"]:
        media_type = "audio/mp4"
    elif ext == ".webm":
        media_type = "video/webm"

    background_tasks.add_task(cleanup_file_and_dir, filepath, temp_dir)

    return FileResponse(
        path=filepath,
        filename=downloaded_filename,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{downloaded_filename}"'}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8008, reload=True)
