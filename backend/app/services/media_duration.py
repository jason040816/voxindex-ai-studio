"""Measure the audio submitted for digital-human video billing."""

import json
import math
import subprocess
import wave


def audio_duration_seconds(path: str) -> int:
    """Bill by input audio length, rounded up to a whole second."""
    try:
        with wave.open(path, "rb") as audio:
            seconds = audio.getnframes() / audio.getframerate()
    except (wave.Error, EOFError, OSError, ZeroDivisionError):
        # ffprobe covers WAV encodings that Python's wave module cannot read.
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
                capture_output=True, text=True, check=True, timeout=10,
            )
            seconds = float(json.loads(result.stdout)["format"]["duration"])
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as exc:
            raise ValueError("无法读取语音时长，请重新生成语音") from exc
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("语音时长无效，请重新生成语音")
    return math.ceil(seconds)
