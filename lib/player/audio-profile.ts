import type { DeviceProfile, DirectPlayProfile } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Browser audio DeviceProfile for PlaybackInfo. Direct-plays whatever this
 * browser can decode (probed with canPlayType) and asks Jellyfin to
 * transcode anything else (e.g. WMA) to progressive MP3 — not HLS, so both
 * <audio> elements can preload the next track for near-gapless playback.
 */

const CANDIDATES: { container: string; codec: string; mime: string }[] = [
  { container: "mp3", codec: "mp3", mime: "audio/mpeg" },
  { container: "flac", codec: "flac", mime: "audio/flac" },
  { container: "m4a,mp4,m4b", codec: "aac", mime: 'audio/mp4; codecs="mp4a.40.2"' },
  { container: "m4a,mp4", codec: "alac", mime: 'audio/mp4; codecs="alac"' },
  { container: "ogg,oga", codec: "vorbis", mime: 'audio/ogg; codecs="vorbis"' },
  { container: "ogg,opus,webm", codec: "opus", mime: 'audio/ogg; codecs="opus"' },
  { container: "webm", codec: "opus", mime: 'audio/webm; codecs="opus"' },
  { container: "wav", codec: "pcm_s16le,pcm_s24le", mime: 'audio/wav; codecs="1"' },
];

let cached: DeviceProfile | null = null;

export function audioDeviceProfile(): DeviceProfile {
  if (cached) return cached;
  const probe = document.createElement("audio");
  const direct: DirectPlayProfile[] = CANDIDATES.filter((c) => probe.canPlayType(c.mime) !== "").map((c) => ({
    Container: c.container,
    AudioCodec: c.codec,
    Type: "Audio",
  }));
  cached = {
    Name: "Jelly Shark audio",
    MaxStreamingBitrate: 140_000_000,
    MaxStaticBitrate: 140_000_000,
    MusicStreamingTranscodingBitrate: 320_000,
    MaxStaticMusicBitrate: 140_000_000,
    DirectPlayProfiles: direct,
    TranscodingProfiles: [
      { Container: "mp3", Type: "Audio", AudioCodec: "mp3", Context: "Streaming", Protocol: "http", MaxAudioChannels: "2" },
      { Container: "mp3", Type: "Audio", AudioCodec: "mp3", Context: "Static", Protocol: "http", MaxAudioChannels: "2" },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [],
  };
  return cached;
}
