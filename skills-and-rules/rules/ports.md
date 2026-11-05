# Dev server ports

The source of truth is `C:\Users\agula\Desktop\anti-human\.claude\launch.json`; start servers with `node .claude/dev.mjs <name>` from the `anti-human` root (or by name from the Claude Code preview). Always pass the port so projects don't collide.

| Name | Project | Port |
|---|---|---|
| `glp-video` | `AI and Remotion/Ai remotions` (Remotion Studio) | 3002 |
| `theaf` | `AI and Remotion/theaf` (Remotion Studio) | 3003 |
| `focus-video` | `learner/ali abdal refrence/focus-video` (Remotion Studio) | 3004 |
| `glp-landing` | `AI and Remotion/glp- 1 landing page` (Next.js) | 3005 |
| `reel-editor` | `AI and Remotion/reel-editor` (Remotion Studio) | 3006 |

Example: `npx remotion studio --port=3006`.
