/**
 * Pure YouTube URL and media formatting utility functions
 */

export interface TranscriptSegment {
  start: number;
  start_formatted: string;
  end: number;
  end_formatted: string;
  text: string;
}

// Regex matching standard watch, shortened, shorts, embed, and music URLs
export const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&].*)?$/;

/**
 * Validates whether a given URL string is a valid YouTube video URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return YOUTUBE_REGEX.test(trimmed);
}

/**
 * Extracts the 11-character video ID from any valid YouTube URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.trim().match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

/**
 * Formats duration in seconds to standard HH:MM:SS or MM:SS format.
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const paddedHrs = String(hrs).padStart(2, '0');
    return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins}:${paddedSecs}`;
}

/**
 * Formats large view counts into compact readable strings (e.g. 1.2M, 450K).
 */
export function formatViewCount(views: number | null | undefined): string {
  if (views === null || views === undefined || isNaN(views)) return 'N/A';
  if (views >= 1_000_000_000) {
    return (views / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B views';
  }
  if (views >= 1_000_000) {
    return (views / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M views';
  }
  if (views >= 1_000) {
    return (views / 1_000).toFixed(1).replace(/\.0$/, '') + 'K views';
  }
  return views.toLocaleString() + ' views';
}

/**
 * Formats YYYYMMDD or ISO date string into human readable format.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown date';
  // YYYYMMDD format from yt-dlp
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return dateStr;
}

/**
 * Converts array of transcript segments into formatted copyable text.
 */
export function formatTranscriptAsText(
  segments: TranscriptSegment[],
  includeTimestamps: boolean = true
): string {
  if (!segments || segments.length === 0) return '';
  if (includeTimestamps) {
    return segments
      .map((s) => `[${s.start_formatted}] ${s.text}`)
      .join('\n');
  }
  return segments.map((s) => s.text).join(' ');
}

/**
 * Converts transcript segments into valid standard SubRip (.srt) subtitle text.
 */
export function formatAsSrt(segments: TranscriptSegment[]): string {
  if (!segments || segments.length === 0) return '';

  function toSrtTime(totalSeconds: number): string {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 1000);

    return (
      String(hrs).padStart(2, '0') +
      ':' +
      String(mins).padStart(2, '0') +
      ':' +
      String(secs).padStart(2, '0') +
      ',' +
      String(ms).padStart(3, '0')
    );
  }

  return segments
    .map((seg, idx) => {
      const startSrt = toSrtTime(seg.start);
      const endSrt = toSrtTime(seg.end);
      return `${idx + 1}\n${startSrt} --> ${endSrt}\n${seg.text}\n`;
    })
    .join('\n');
}
