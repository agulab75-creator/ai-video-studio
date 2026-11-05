# Agents & Skills

The one source for the studio's agent skills and rules. Claude Code (`~/.claude/skills`) and Antigravity (`~/.gemini/config/skills`, `~/.gemini/config/rules`) link here — edit files here only. After adding a skill, run `powershell -File install.ps1`.

| Folder | What |
|---|---|
| `skills/ai-creative-director` | Talking-head video → finished reel (layout decisions, plan, build, QA) with `AI and Remotion/reel-editor` |
| `skills/ai-broll` | Image/cutout/video generation on Modal (Qwen-Image, BiRefNet) |
| `skills/visual-dna-learner` | Study reference videos → `style-spec.json` + `STYLE-BIBLE.md`; audit script included |
| `rules/studio-rules.md` | Rules for every client and tool |
| `rules/visual-taste.md` | How a script beat becomes a visual (approved/rejected examples) |
| `rules/premiere-uxp-traps.md` | Premiere UXP scripting traps |
| `rules/ports.md` | Dev server ports |

Client looks live with the project (`reel-editor/brands/<client>/BRAND.md`); learned styles live in `learner/<study>/style-dna/`. Remotion's own skills are installed with `npx skills add remotion-dev/skills -g` (in `~/.agents/skills`), not copied here.

History of the 2026-09-27 cleanup: `CHANGES.md`. Backup of the old copies: `~\skills-backup-2026-09-27.zip`.
