"""Remove background noise from a voice track with DeepFilterNet3 on Modal (CPU).

    python -m modal run pipeline/denoise_modal.py --wav in.wav --out out.wav [--atten 0]

--atten caps the noise reduction in dB (0 = no cap, full strength; 12-18 keeps a little room tone so
the voice sounds less "processed"). Input: a 48 kHz WAV (extract it with ffmpeg first); output: 48 kHz WAV.
"""
import modal

app = modal.App("reel-denoise")
# DeepFilterNet imports torchaudio.backend, which torchaudio >= 2.1 removed: pin 2.0.x.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install("torch==2.0.1", "torchaudio==2.0.2", "numpy<2", "deepfilternet==0.5.6", index_url=None)
)


@app.function(image=image, cpu=8, memory=8192, timeout=1800)
def denoise(wav: bytes, atten: float) -> bytes:
    import io
    import tempfile

    import torchaudio
    from df.enhance import enhance, init_df, load_audio

    model, state, _ = init_df()  # DeepFilterNet3 (small download each run)
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        f.write(wav)
        f.flush()
        audio, _ = load_audio(f.name, sr=state.sr())
    out = enhance(model, state, audio, atten_lim_db=atten or None)
    buf = io.BytesIO()
    torchaudio.save(buf, out, state.sr(), format="wav")
    return buf.getvalue()


@app.local_entrypoint()
def main(wav: str, out: str, atten: float = 0):
    from pathlib import Path

    Path(out).write_bytes(denoise.remote(Path(wav).read_bytes(), atten))
    print(f"wrote {out} (atten {atten or 'full'})")
