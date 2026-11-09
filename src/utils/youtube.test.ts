import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidYouTubeUrl,
  extractYouTubeVideoId,
  formatDuration,
  formatViewCount,
  formatDate,
  formatTranscriptAsText,
  formatAsSrt,
  TranscriptSegment,
} from './youtube';

test('validates standard, short, and shorts YouTube URLs correctly', () => {
  // Standard watch URLs
  assert.equal(
    isValidYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    true
  );
  assert.equal(
    isValidYouTubeUrl('http://youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
    true
  );

  // Shortened URLs
  assert.equal(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), true);
  assert.equal(isValidYouTubeUrl('http://youtu.be/dQw4w9WgXcQ?t=10'), true);

  // Shorts URLs
  assert.equal(
    isValidYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    true
  );

  // Embed URLs
  assert.equal(
    isValidYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    true
  );

  // Music URLs
  assert.equal(
    isValidYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'),
    true
  );

  // Invalid URLs
  assert.equal(isValidYouTubeUrl('https://vimeo.com/123456789'), false);
  assert.equal(isValidYouTubeUrl('https://google.com'), false);
  assert.equal(isValidYouTubeUrl('not-a-url'), false);
  assert.equal(isValidYouTubeUrl(''), false);
});

test('extracts video ID accurately from various YouTube URL variants', () => {
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abcdef12345'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://randomwebsite.com/watch?v=123'),
    null
  );
});

test('formats seconds into clean duration timestamps', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(45), '00:45');
  assert.equal(formatDuration(213), '03:33');
  assert.equal(formatDuration(3661), '01:01:01');
  assert.equal(formatDuration(-10), '00:00');
});

test('formats view counts into compact readable format', () => {
  assert.equal(formatViewCount(500), '500 views');
  assert.equal(formatViewCount(1500), '1.5K views');
  assert.equal(formatViewCount(1500000), '1.5M views');
  assert.equal(formatViewCount(1400000000), '1.4B views');
  assert.equal(formatViewCount(null), 'N/A');
});

test('formats upload dates into clean readable string', () => {
  assert.equal(formatDate('20091025'), 'Oct 25, 2009');
  assert.equal(formatDate('20240101'), 'Jan 1, 2024');
  assert.equal(formatDate(''), 'Unknown date');
});

test('formats transcript segments into plain and SRT texts', () => {
  const sampleSegments: TranscriptSegment[] = [
    {
      start: 1.5,
      start_formatted: '00:01',
      end: 4.2,
      end_formatted: '00:04',
      text: "We're no strangers to love",
    },
    {
      start: 4.5,
      start_formatted: '00:04',
      end: 8.0,
      end_formatted: '00:08',
      text: 'You know the rules and so do I',
    },
  ];

  const withTimestamps = formatTranscriptAsText(sampleSegments, true);
  assert.ok(withTimestamps.includes("[00:01] We're no strangers to love"));

  const plainOnly = formatTranscriptAsText(sampleSegments, false);
  assert.ok(plainOnly.includes("We're no strangers to love You know the rules"));

  const srt = formatAsSrt(sampleSegments);
  assert.ok(srt.includes('1\n00:00:01,500 --> 00:00:04,200'));
  assert.ok(srt.includes("We're no strangers to love"));
  assert.ok(srt.includes('2\n00:00:04,500 --> 00:00:08,000'));
});
