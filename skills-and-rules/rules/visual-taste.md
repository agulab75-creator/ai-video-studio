# User Visual Taste — Script-to-Visual Decision Layer

This file captures the user's demonstrated preferences for how a script beat becomes a visual treatment.
The `ai-creative-director` skill reads it **before** choosing what each visual shows, alongside the client's `BRAND.md` and the style's `style-spec.json`.
These are **decision rules derived from approved and rejected examples**, not rigid templates. The examples come from the Urban Polyclinic GLP-1 reels, but the principles apply to every client.

---

## Core Principle

> **Visualize the mechanism, not the label.**

When a script mentions a concept (weight loss, body resistance, BMI), the job is NOT to find an icon or stock footage labeled with that word.
The job is to find the **actual physical action or transformation** that IS that concept, and animate it.

---

## Approved Patterns (Use These)

### 1. Physical Transformation as Hero
The scene's primary visual is a transformation happening — not a presenter describing it.

**Example (approved):** "The body resists gym and diet" → physical printed cutouts of GYM and DIET press toward a body silhouette → body compresses → pushes them back. The resistance IS the animation. No caption needed.

**Example (approved):** "Successful weight loss" → heavy person on analog scale → needle sweeps → paper editorial reveal transforms the same person into the lean version. The transformation IS the story.

**Decision rule:** If the script describes a change or mechanism, the scene must show that change physically happening — not a presenter talking over a related image.

---

### 2. Mechanisms Over Symbols
Show how something works, not what category it belongs to.

**Example (approved):** GLP-1 mechanism → molecular lock-and-key animation, not a generic pill icon.

**Example (rejected):** "Weight loss" → gym equipment + salad bowl stock footage. These are noun-maps (the word → a related noun), not visualizations of the actual idea.

**Decision rule:** Ask: "Is this image showing what the script *says is happening*, or just something *associated* with the topic?" If associated → reject, redesign.

---

### 3. Full-Screen Conceptual B-Roll
When the concept is strong enough to carry the frame alone, use full-screen B-roll with no presenter overlay.

**Example (approved):** The body-resistance scene — full 9:16, no presenter. The visual communicates independently.

**Example (approved):** The weight-loss transformation — full 9:16, no talking head. The analog scale and reveal are the entire story.

**Decision rule:** If a standalone B-roll scene communicates the idea MORE clearly than presenter + overlay, choose standalone B-roll.

---

### 4. Tactile 2D Editorial When Physical Interaction is the Concept
When the idea is about objects interacting, forces, or physical processes, use physical paper/cutout animation — not digital UI, not 3D, not motion graphics.

**Example (approved):** Body resistance → printed cutouts physically colliding.
**Example (approved):** BMI assessment → mechanical printed cards with number-tick animation.

**Decision rule:** If the concept involves physical forces, transformation, or objects acting on each other → tactile 2D cutout animation is the first-choice format.

---

### 5. Visual Payoff — Clear Begin → Transform → Resolve
Every scene must have a legible arc: setup → transformation → clear resolution.

**Example (approved):** Scale at 110 KG → needle sweeps → person transforms → 70 KG + checkmark lands. The payoff (checkmark + lean person confident on scale) closes the loop.

**Decision rule:** A scene without a clear visual payoff moment is incomplete. Identify the payoff before building the scene.

---

### 6. Visual Metaphors That Communicate Without Captions
The visual should work with the sound off.

**Example (approved):** Body pushing GYM and DIET cutouts back — communicates resistance without any text on screen.

**Decision rule:** Before finalizing a scene, ask: "If I mute this, does the idea still land?" If not, the visual is not strong enough.

---

## Rejected Patterns (Never Use These)

### ❌ Noun-Mapping
Replacing a concept with its most obvious noun association.

| Script says | Noun-map (rejected) | What to do instead |
|---|---|---|
| "weight loss" | gym / dumbbell / salad | physical body transformation, scale needle, before/after reveal |
| "body resists" | red X icon, warning sign | objects physically pushing back against the body cutout |
| "BMI check" | calculator icon / app UI | mechanical printed cards with height + weight values flowing into a formula |
| "treatment eligible" | green checkmark stamp (alone) | physical medical assessment result card landing with weight |

---

### ❌ Generic Icons or Infographic Visuals
- No floating app-style icons.
- No dashboard-style charts as standalone visuals.
- No generic fitness infographic (dumbbells, salad, running stick figure).

---

### ❌ Captions as Primary Storytelling
- Captions are support, not the story.
- A scene where the caption is the only thing communicating the idea = failed scene.
- The visual must carry the narrative independently; captions confirm and reinforce.

---

### ❌ Presenter Overlay When Standalone B-Roll Is Stronger
- Do not default to "presenter + small overlay graphic" when the concept deserves its own scene.
- If the idea has enough visual richness for a full-screen B-roll, give it one.

---

### ❌ Opacity Crossfades for Physical Transformations
- If the concept is a transformation (person changes, state changes, object changes), do NOT use an opacity fade between states.
- Physical transformations require physical reveal techniques: directional wipes, clip masks, paper reveals, rotational reveals.
- Crossfade = concept is invisible. Wipe/reveal = concept is legible.

---

### ❌ Random B-Roll That Doesn't Depict the Narrative Action
- B-roll must depict what the script is *actually describing*, not just a mood or category match.
- "Successful weight loss" ≠ a person running. It = the moment of transformation itself.

---

## Scene Format Decision Tree

When converting a script beat to a visual treatment, answer these in order:

```
1. What is the ACTUAL MECHANISM or ACTION the script describes?
   → This is your animation subject. Not a symbol of it. Not a label.

2. Does the mechanism involve physical interaction or transformation?
   → YES → tactile 2D editorial cutout animation (paper, printed, physical shadows)
   → NO  → consider 3D cinematic or illustrated mechanism

3. Is the visual strong enough to fill the full 9:16 frame alone?
   → YES → full-screen visual, no presenter
   → NO  → header panel (visual in the top ~45%, presenter below) or an overlay

4. Is there a clear visual payoff at the end of the scene?
   → YES → proceed
   → NO  → redesign the arc before building

5. Does it work with the sound off?
   → YES → proceed
   → NO  → the visual metaphor is not strong enough; redesign
```

---

## Origin
These preferences were extracted from the GLP-1 weight loss video production session (September 2026).
Approved scenes: Body Resistance, BMI Assessment, Successful Weight Loss (V6).
Rejected treatments: generic body/gym stock overlay, opacity crossfade body swap, simple counter animation, storyboard-panel-as-video-asset.
