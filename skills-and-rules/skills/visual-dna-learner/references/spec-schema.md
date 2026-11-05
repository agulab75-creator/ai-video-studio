# style-spec.json schema (v5)

`style-spec.json` is the interface downstream agents read. Keep it deterministic and implementation-oriented. Every rule carries `confidence` (`CORE` / `COMMON` / `OCCASIONAL` / `ONE-OFF` / `NOT OBSERVED`), `video_count` ("7/11"), and `evidence` (video ID + timestamp).

```json
{
  "schema_version": "5.0",
  "style_name": "",
  "style_slug": "",
  "source": {
    "study_folder": "learner/<study>",
    "inventory": "audit/inventory.json",
    "reference_count": 0,
    "measured_at_fps": 2,
    "not_verified": ["music", "sfx"]
  },

  "layout_grammar": {
    "layouts": [
      {
        "id": "header",
        "description": "",
        "triggers": ["concept named for the first time"],
        "length_seconds": {"min": 1.5, "typical": 4, "max": 10},
        "params": {"panel_height_pct": [35, 45], "edge": "torn-paper", "presenter_in_front": true, "aroll_shift_pct": 18},
        "entrance": {"frames_at_30fps": 4, "easing": "ease-out", "overshoot": false, "evidence": "ALI_002 22.10-22.23s"},
        "confidence": "COMMON", "video_count": "6/11", "evidence": []
      }
    ],
    "decision_rules": [
      {"if": "a concept is named for the first time", "then": "header with the term as title", "confidence": "COMMON", "evidence": []}
    ]
  },

  "coverage": {
    "aroll_share": {"min": 0.22, "typical": [0.35, 0.45], "max": 0.58},
    "first_visual_seconds": {"typical": 0.5, "max": 1.0},
    "end_hold_seconds": {"typical": [8, 12]},
    "notes": ""
  },

  "captions": {
    "always_on": true, "over_fullscreen": true,
    "position_pct_of_height": 78,
    "style": "", "words_per_chunk": [3, 5], "highlight": "",
    "confidence": "CORE", "video_count": "11/11"
  },

  "look": {
    "backgrounds": [], "textures": [], "title_type": [], "body_type": [], "color_notes": "",
    "asset_treatments": []
  },

  "motion": {
    "timing_table": [
      {"element": "", "duration_frames": 0, "fps": 30, "easing": "", "overshoot": false,
       "measured_from": "strip file + frame numbers", "instances": 1, "confidence": ""}
    ]
  },

  "transitions": [
    {"between": "aroll -> fullscreen", "type": "hard cut | paper wipe | slide", "frames_at_30fps": 0, "share": "", "evidence": []}
  ],

  "audio": {"music": "not verified", "sfx": "not verified"},

  "anti_patterns": [],

  "adaptations": {
    "note": "Our production choices, not the creator's. Kept separate from observed DNA.",
    "faceless": {}
  },

  "reference_frames": [
    {"file": "references/<file>.jpg", "video_id": "", "timestamp": 0, "proves": ""}
  ]
}
```

Rules:
- `layout_grammar` and `coverage` are mandatory for talking-head styles.
- A number measured from one instance gets `"instances": 1` — don't dress it up as a general rule.
- If something wasn't checked, list it in `source.not_verified` instead of guessing.
