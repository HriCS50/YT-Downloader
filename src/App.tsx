import React, { useState, useEffect } from 'react';
import {
  Search,
  Youtube,
  FileText,
  Download,
  Clock,
  Eye,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Terminal,
  Settings,
  Film,
  Music,
  Share2,
  RefreshCw,
  X,
  Volume2,
  FileCode,
  Check,
} from 'lucide-react';
import {
  isValidYouTubeUrl,
  formatDuration,
  formatViewCount,
  formatDate,
  formatTranscriptAsText,
  formatAsSrt,
  TranscriptSegment,
} from './utils/youtube';

interface SubtitleTrack {
  code: string;
  name: string;
  is_generated: boolean;
}

interface AvailableResolution {
  height: number;
  label: string;
  ext: string;
  filesize: number | null;
}

interface VideoMetadata {
  id: string;
  url: string;
  webpage_url: string;
  title: string;
  channel: string;
  channel_url?: string;
  channel_id?: string;
  duration?: number;
  duration_formatted: string;
  thumbnail?: string;
  upload_date?: string;
  description: string;
  view_count?: number;
  like_count?: number;
  tags: string[];
  categories: string[];
  available_subtitles: SubtitleTrack[];
  available_resolutions: AvailableResolution[];
  has_audio: boolean;
  ffmpeg_installed: boolean;
}

interface CaptionsData {
  video_id: string;
  title: string;
  language: string;
  is_generated: boolean;
  total_segments: number;
  segments: TranscriptSegment[];
  plain_text: string;
  srt_text: string;
}

interface HealthStatus {
  status: string;
  yt_dlp_version: string;
  ffmpeg_installed: boolean;
  node_installed: boolean;
}

const SAMPLE_VIDEOS = [
  {
    name: 'Rick Astley (4K Music)',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    name: 'Blender - Big Buck Bunny',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  },
  {
    name: 'Shortened youtu.be Link',
    url: 'https://youtu.be/dQw4w9WgXcQ',
  },
];

export default function App() {
  const [urlInput, setUrlInput] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [activeTab, setActiveTab] = useState<'metadata' | 'captions' | 'download'>('metadata');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);

  // Captions state
  const [selectedLang, setSelectedLang] = useState<string>('en');
  const [captions, setCaptions] = useState<CaptionsData | null>(null);
  const [isLoadingCaptions, setIsLoadingCaptions] = useState(false);
  const [captionSearch, setCaptionSearch] = useState('');
  const [transcriptViewMode, setTranscriptViewMode] = useState<'timestamps' | 'reading'>('timestamps');

  // Downloader state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('best');
  const [downloadStatusMsg, setDownloadStatusMsg] = useState<string | null>(null);

  // UI state
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [copiedState, setCopiedState] = useState<{ [key: string]: boolean }>({});
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Check health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setHealth(data);
      })
      .catch((err) => console.log('Backend health probe:', err.message));
  }, []);

  const triggerCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedState((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedState((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const handleFetchMetadata = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) {
      setErrorMsg('Please enter a YouTube video URL.');
      return;
    }

    if (!isValidYouTubeUrl(cleanUrl)) {
      setErrorMsg(
        'Invalid YouTube URL. Please provide a standard watch link (e.g., youtube.com/watch?v=...), shortened youtu.be link, or Shorts URL.'
      );
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    setMetadata(null);
    setCaptions(null);

    try {
      const resp = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned error ${resp.status}`);
      }

      const data: VideoMetadata = await resp.json();
      setMetadata(data);
      // Auto-select first available caption language or en
      if (data.available_subtitles.length > 0) {
        setSelectedLang(data.available_subtitles[0].code);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch video information.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchCaptions = async (langCode: string) => {
    if (!metadata) return;
    setIsLoadingCaptions(true);
    setErrorMsg(null);

    try {
      const resp = await fetch(
        `/api/captions?url=${encodeURIComponent(metadata.url)}&lang=${encodeURIComponent(langCode)}`
      );

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to extract captions.');
      }

      const data: CaptionsData = await resp.json();
      setCaptions(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not retrieve captions.');
    } finally {
      setIsLoadingCaptions(false);
    }
  };

  // Trigger captions fetch automatically when switching to captions tab if not loaded
  useEffect(() => {
    if (activeTab === 'captions' && metadata && !captions && !isLoadingCaptions) {
      handleFetchCaptions(selectedLang);
    }
  }, [activeTab, metadata]);

  const handleDownloadMedia = async (formatId: string) => {
    if (!metadata) return;
    setIsDownloading(true);
    setDownloadStatusMsg('Initializing yt-dlp download & stream processing...');
    setErrorMsg(null);

    try {
      const resp = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: metadata.url,
          format_id: formatId,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Download request failed.');
      }

      // Read Content-Disposition header for filename
      const disposition = resp.headers.get('Content-Disposition');
      let filename = `${metadata.id}_${formatId}.mp4`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      setDownloadStatusMsg('Streaming file to browser...');
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      setDownloadStatusMsg('Download completed successfully!');
      setTimeout(() => setDownloadStatusMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred during media download.');
      setDownloadStatusMsg(null);
    } finally {
      setIsDownloading(false);
    }
  };

  // Filtered transcript segments based on search
  const filteredSegments = captions?.segments.filter((seg) =>
    seg.text.toLowerCase().includes(captionSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/20 ring-1 ring-red-500/30">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">YT Extractor</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  yt-dlp + FastAPI
                </span>
              </div>
              <p className="text-xs text-neutral-400">Metadata, Transcripts & Media</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {health && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800/70 border border-neutral-700/60 text-xs text-neutral-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>yt-dlp v{health.yt_dlp_version.slice(0, 10)}</span>
                {health.ffmpeg_installed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-200 font-mono">
                    ffmpeg OK
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => setShowDocsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-neutral-200 transition"
              aria-label="Local Setup & Docs"
            >
              <Terminal className="w-3.5 h-3.5 text-red-400" />
              <span>Setup & API Docs</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Search Hero Box */}
        <section className="bg-neutral-900/80 rounded-2xl border border-neutral-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="max-w-3xl mx-auto text-center space-y-3 mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Extract YouTube Metadata, Captions & Video
            </h1>
            <p className="text-sm text-neutral-400">
              Powered by native <code className="text-red-400 font-mono">yt-dlp</code> and{' '}
              <code className="text-red-400 font-mono">FastAPI</code>. Paste any YouTube URL, Shorts, or
              youtu.be link below.
            </p>
          </div>

          <form onSubmit={handleFetchMetadata} className="max-w-3xl mx-auto space-y-3">
            <div className="relative flex items-center">
              <div className="absolute left-4 pointer-events-none text-neutral-500">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                className="w-full pl-12 pr-28 py-3.5 rounded-xl bg-neutral-950/90 border border-neutral-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-neutral-100 placeholder-neutral-500 text-sm outline-none transition"
                aria-label="YouTube Video URL"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="absolute right-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white font-medium text-xs tracking-wide shadow-md transition flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Extract</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Demo URLs */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-neutral-400">
              <span className="font-medium text-neutral-500">Try sample:</span>
              {SAMPLE_VIDEOS.map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => {
                    setUrlInput(sample.url);
                  }}
                  className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700/60 transition"
                >
                  {sample.name}
                </button>
              ))}
            </div>
          </form>

          {/* Error Message Banner */}
          {errorMsg && (
            <div className="max-w-3xl mx-auto mt-4 p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-300 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-200">Request Error</p>
                <p className="text-xs text-red-300/90 mt-0.5">{errorMsg}</p>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-neutral-400 hover:text-neutral-200"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>

        {/* Video Loaded Content */}
        {metadata && (
          <div className="space-y-6">
            {/* Navigation Tabs */}
            <div className="flex border-b border-neutral-800 gap-2">
              <button
                onClick={() => setActiveTab('metadata')}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === 'metadata'
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Film className="w-4 h-4" />
                <span>Video Metadata</span>
              </button>

              <button
                onClick={() => setActiveTab('captions')}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === 'captions'
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Captions & Transcript</span>
                {metadata.available_subtitles.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-neutral-800 text-neutral-300 text-xs">
                    {metadata.available_subtitles.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('download')}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === 'download'
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Download Media</span>
              </button>
            </div>

            {/* TAB 1: METADATA DETAILS */}
            {activeTab === 'metadata' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Thumbnail & Quick Player Preview */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 group shadow-md">
                    <img
                      src={metadata.thumbnail}
                      alt={metadata.title}
                      className="w-full aspect-video object-cover group-hover:scale-105 transition duration-500"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 backdrop-blur text-[11px] font-mono text-white flex items-center gap-1">
                      <Clock className="w-3 h-3 text-red-400" />
                      <span>{metadata.duration_formatted}</span>
                    </div>
                  </div>

                  {/* Channel Card */}
                  <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center font-bold text-red-400">
                          {metadata.channel.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-neutral-200 flex items-center gap-1.5">
                            {metadata.channel}
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                          </p>
                          <p className="text-xs text-neutral-500">Creator</p>
                        </div>
                      </div>

                      {metadata.channel_url && (
                        <a
                          href={metadata.channel_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
                          title="Open YouTube Channel"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>

                    <a
                      href={metadata.webpage_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full text-center py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700/60 text-xs font-medium text-neutral-200 transition"
                    >
                      Open on YouTube
                    </a>
                  </div>

                  {/* Available Subtitles Pill list */}
                  <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Available Subtitles
                      </span>
                      <span className="text-xs text-neutral-400">
                        {metadata.available_subtitles.length} tracks
                      </span>
                    </div>

                    {metadata.available_subtitles.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {metadata.available_subtitles.map((track) => (
                          <button
                            key={track.code}
                            onClick={() => {
                              setSelectedLang(track.code);
                              setActiveTab('captions');
                              handleFetchCaptions(track.code);
                            }}
                            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] text-neutral-300 border border-neutral-700 transition"
                          >
                            {track.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 italic">No subtitle tracks found.</p>
                    )}
                  </div>
                </div>

                {/* Right Column: Title, Metrics, Description */}
                <div className="lg:col-span-2 space-y-5">
                  <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                        {metadata.title}
                      </h2>
                      <button
                        onClick={() => triggerCopy(metadata.title, 'title')}
                        className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 transition shrink-0"
                        title="Copy Video Title"
                      >
                        {copiedState['title'] ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                          <Eye className="w-3.5 h-3.5 text-red-400" />
                          <span>Views</span>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {formatViewCount(metadata.view_count)}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          <span>Upload Date</span>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {formatDate(metadata.upload_date)}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          <span>Duration</span>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {metadata.duration_formatted}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                          <Film className="w-3.5 h-3.5 text-purple-400" />
                          <span>Resolutions</span>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {metadata.available_resolutions.length > 0
                            ? `${metadata.available_resolutions[0].height}p Max`
                            : 'Standard'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description Box */}
                  <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-neutral-200">Video Description</span>
                      <button
                        onClick={() => triggerCopy(metadata.description, 'desc')}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
                      >
                        {copiedState['desc'] ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Description</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div
                      className={`text-xs text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed rounded-lg bg-neutral-950/80 p-4 border border-neutral-800/60 overflow-y-auto transition-all ${
                        isDescExpanded ? 'max-h-96' : 'max-h-36'
                      }`}
                    >
                      {metadata.description || 'No description provided for this video.'}
                    </div>

                    {metadata.description && metadata.description.length > 300 && (
                      <button
                        onClick={() => setIsDescExpanded(!isDescExpanded)}
                        className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 transition pt-1"
                      >
                        {isDescExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Show less</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Read full description</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Video Tags */}
                  {metadata.tags && metadata.tags.length > 0 && (
                    <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2">
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Video Tags ({metadata.tags.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {metadata.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-0.5 rounded-full bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CAPTIONS & TRANSCRIPT */}
            {activeTab === 'captions' && (
              <div className="space-y-6">
                {/* Captions Controls Bar */}
                <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-medium text-neutral-400">Language Track:</label>
                    <select
                      value={selectedLang}
                      onChange={(e) => {
                        setSelectedLang(e.target.value);
                        handleFetchCaptions(e.target.value);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-xs text-neutral-200 outline-none focus:border-red-500"
                    >
                      {metadata.available_subtitles.length > 0 ? (
                        metadata.available_subtitles.map((track) => (
                          <option key={track.code} value={track.code}>
                            {track.name}
                          </option>
                        ))
                      ) : (
                        <option value="en">English (Default)</option>
                      )}
                    </select>

                    <button
                      onClick={() => handleFetchCaptions(selectedLang)}
                      disabled={isLoadingCaptions}
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 transition"
                      title="Reload Captions"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCaptions ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Search inside transcript */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-500" />
                      <input
                        type="text"
                        value={captionSearch}
                        onChange={(e) => setCaptionSearch(e.target.value)}
                        placeholder="Search transcript..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-red-500"
                      />
                      {captionSearch && (
                        <button
                          onClick={() => setCaptionSearch('')}
                          className="absolute right-2.5 top-2 text-neutral-500 hover:text-neutral-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex rounded-lg bg-neutral-950 border border-neutral-700 p-0.5">
                      <button
                        onClick={() => setTranscriptViewMode('timestamps')}
                        className={`px-2.5 py-1 rounded text-xs transition ${
                          transcriptViewMode === 'timestamps'
                            ? 'bg-neutral-800 text-white font-medium'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        Timestamps
                      </button>
                      <button
                        onClick={() => setTranscriptViewMode('reading')}
                        className={`px-2.5 py-1 rounded text-xs transition ${
                          transcriptViewMode === 'reading'
                            ? 'bg-neutral-800 text-white font-medium'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        Reading
                      </button>
                    </div>
                  </div>
                </div>

                {/* Captions Download Toolbar */}
                {captions && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <span>Total segments: {captions.total_segments}</span>
                      {captions.is_generated && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                          Auto-generated
                        </span>
                      )}
                      {captionSearch && (
                        <span className="text-neutral-300 font-medium">
                          ({filteredSegments?.length || 0} match
                          {filteredSegments?.length === 1 ? '' : 'es'})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => triggerCopy(captions.plain_text, 'transcript')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition"
                      >
                        {copiedState['transcript'] ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Plain Text</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`/api/captions?url=${encodeURIComponent(
                          metadata.url
                        )}&lang=${encodeURIComponent(selectedLang)}&download_as=txt`}
                        download
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition"
                      >
                        <Download className="w-3.5 h-3.5 text-red-400" />
                        <span>Download .TXT</span>
                      </a>

                      <a
                        href={`/api/captions?url=${encodeURIComponent(
                          metadata.url
                        )}&lang=${encodeURIComponent(selectedLang)}&download_as=srt`}
                        download
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition"
                      >
                        <FileCode className="w-3.5 h-3.5 text-amber-400" />
                        <span>Download .SRT</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Captions Content Display */}
                {isLoadingCaptions ? (
                  <div className="py-20 text-center space-y-3 bg-neutral-900/40 rounded-xl border border-neutral-800">
                    <RefreshCw className="w-8 h-8 text-red-500 animate-spin mx-auto" />
                    <p className="text-sm text-neutral-300">Extracting and parsing subtitle tracks...</p>
                  </div>
                ) : captions && captions.segments.length > 0 ? (
                  transcriptViewMode === 'timestamps' ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 divide-y divide-neutral-800/80 max-h-[550px] overflow-y-auto">
                      {filteredSegments && filteredSegments.length > 0 ? (
                        filteredSegments.map((seg, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 hover:bg-neutral-800/40 transition flex items-start gap-4 group"
                          >
                            <span className="px-2 py-0.5 rounded bg-neutral-950 font-mono text-[11px] text-red-400 border border-neutral-800 shrink-0 select-none">
                              {seg.start_formatted}
                            </span>
                            <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed flex-1">
                              {seg.text}
                            </p>
                            <button
                              onClick={() => triggerCopy(`[${seg.start_formatted}] ${seg.text}`, `seg_${idx}`)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-700 text-neutral-400 transition"
                              title="Copy Segment"
                            >
                              {copiedState[`seg_${idx}`] ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-12 text-center text-xs text-neutral-500">
                          No segments matched your search query "{captionSearch}".
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Reading View */
                    <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/60 max-h-[550px] overflow-y-auto text-sm text-neutral-200 leading-relaxed space-y-4">
                      {captions.plain_text}
                    </div>
                  )
                ) : (
                  <div className="py-16 text-center space-y-3 bg-neutral-900/40 rounded-xl border border-neutral-800">
                    <FileText className="w-10 h-10 text-neutral-600 mx-auto" />
                    <p className="text-sm font-semibold text-neutral-300">No Captions Available</p>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto">
                      This video does not have manual subtitles or automatic captions enabled, or subtitles
                      could not be fetched.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DOWNLOAD MEDIA */}
            {activeTab === 'download' && (
              <div className="space-y-6">
                <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-red-500" />
                    <span>Download Video or Audio File</span>
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Streams direct from <code className="text-red-400 font-mono">yt-dlp</code> with proper{' '}
                    <code className="text-neutral-300 font-mono">Content-Disposition</code> headers. Streams
                    are automatically merged with audio using <code className="text-neutral-300 font-mono">ffmpeg</code>.
                  </p>
                </div>

                {downloadStatusMsg && (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{downloadStatusMsg}</span>
                  </div>
                )}

                {/* Format Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Best Available */}
                  <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-red-500/50 transition flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                          Recommended
                        </span>
                        <Film className="w-4 h-4 text-neutral-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Best Available Video</h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        Highest resolution stream (up to 4K/1080p) merged with optimal audio track in MP4.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadMedia('best')}
                      disabled={isDownloading}
                      className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-2 transition shadow"
                    >
                      {isDownloading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Best MP4</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 1080p Full HD */}
                  <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300 border border-neutral-700">
                          1080p Full HD
                        </span>
                        <Film className="w-4 h-4 text-neutral-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Full HD 1080p</h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        High definition 1920x1080 MP4 multiplexed with high-bitrate audio.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadMedia('1080p')}
                      disabled={isDownloading}
                      className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download 1080p MP4</span>
                    </button>
                  </div>

                  {/* 720p HD */}
                  <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300 border border-neutral-700">
                          720p HD
                        </span>
                        <Film className="w-4 h-4 text-neutral-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Standard HD 720p</h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        Balanced quality and file size for faster download and playback.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadMedia('720p')}
                      disabled={isDownloading}
                      className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download 720p MP4</span>
                    </button>
                  </div>

                  {/* 480p SD */}
                  <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300 border border-neutral-700">
                          480p SD
                        </span>
                        <Film className="w-4 h-4 text-neutral-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Standard 480p</h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        Compact file size ideal for mobile devices and slow internet connections.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadMedia('480p')}
                      disabled={isDownloading}
                      className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download 480p MP4</span>
                    </button>
                  </div>

                  {/* Audio MP3 */}
                  <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300 border border-neutral-700">
                          MP3 Audio
                        </span>
                        <Music className="w-4 h-4 text-amber-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Audio Only (MP3)</h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        High-quality 192kbps MP3 audio extracted and converted via ffmpeg.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadMedia('audio_mp3')}
                      disabled={isDownloading}
                      className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Download MP3</span>
                    </button>
                  </div>

                  {/* Audio M4A */}
                  <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition flex flex-col justify-between space-y-4 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300 border border-neutral-700">
                          M4A Audio
                        </span>
                        <Music className="w-4 h-4 text-blue-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Audio Only (M4A)</h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        Original high fidelity AAC audio stream direct from YouTube without re-encoding.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadMedia('audio_m4a')}
                      disabled={isDownloading}
                      className="w-full py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Download M4A</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Setup Instructions & API Documentation Modal */}
      {showDocsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-white text-base">Local Setup & API Documentation</h3>
              </div>
              <button
                onClick={() => setShowDocsModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-neutral-300">
              {/* 1. Prerequisites */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">1. Installing FFmpeg (Required for stream merging)</h4>
                <p className="text-neutral-400">
                  yt-dlp uses ffmpeg to combine separate high-definition video and audio streams into single MP4
                  files.
                </p>
                <div className="space-y-2 font-mono text-[11px] bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                  <p className="text-neutral-400"># macOS (Homebrew)</p>
                  <p className="text-emerald-400">brew install ffmpeg</p>
                  <p className="text-neutral-400 mt-2"># Ubuntu / Debian</p>
                  <p className="text-emerald-400">sudo apt update && sudo apt install -y ffmpeg</p>
                  <p className="text-neutral-400 mt-2"># Windows (winget)</p>
                  <p className="text-emerald-400">winget install Gyan.FFmpeg</p>
                </div>
              </div>

              {/* 2. Python Backend */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">2. Run Python FastAPI Backend Standalone</h4>
                <div className="space-y-1 font-mono text-[11px] bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                  <p className="text-neutral-400"># Install requirements</p>
                  <p className="text-emerald-400">pip install -r requirements.txt</p>
                  <p className="text-neutral-400 mt-2"># Start FastAPI server</p>
                  <p className="text-emerald-400">uvicorn main:app --host 0.0.0.0 --port 8000 --reload</p>
                </div>
              </div>

              {/* 3. API Endpoints */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">3. API Endpoints Quick Reference</h4>
                <ul className="space-y-2 font-mono text-[11px]">
                  <li className="p-2.5 rounded bg-neutral-950 border border-neutral-800">
                    <span className="text-amber-400 font-bold">POST /api/info</span>
                    <p className="text-neutral-400 font-sans mt-0.5">
                      Extracts video title, channel, duration, thumbnail, tags, and available subtitles without
                      downloading video files.
                    </p>
                  </li>
                  <li className="p-2.5 rounded bg-neutral-950 border border-neutral-800">
                    <span className="text-blue-400 font-bold">GET /api/captions?url=...&lang=en</span>
                    <p className="text-neutral-400 font-sans mt-0.5">
                      Returns parsed timestamped transcript cues. Supports <code className="text-neutral-200">&download_as=txt</code> or{' '}
                      <code className="text-neutral-200">&download_as=srt</code>.
                    </p>
                  </li>
                  <li className="p-2.5 rounded bg-neutral-950 border border-neutral-800">
                    <span className="text-red-400 font-bold">POST /api/download</span>
                    <p className="text-neutral-400 font-sans mt-0.5">
                      Accepts <code className="text-neutral-200">{"{ url, format_id }"}</code> and streams MP4 or MP3
                      attachment directly to the client.
                    </p>
                  </li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setShowDocsModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950/80 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-neutral-500">
          Built with FastAPI, yt-dlp, FFmpeg, and React. Designed for local metadata & transcript extraction.
        </div>
      </footer>
    </div>
  );
}
