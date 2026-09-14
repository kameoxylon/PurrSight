# PurrSight

**AI-Powered Cat Pain Assessment Using the Feline Grimace Scale**

Upload a photo of your cat and receive an AI-assisted assessment based on the Feline Grimace Scale to help identify potential signs of pain and encourage timely veterinary care.

**Microsoft Hackathon 2026** — [project submission](https://innovation-studio.microsoft.com/events/hackathon2026/submissions/projects/proj-bc90c4ff-c29c-48a2-ac1f-7e56edcbb466)

---

## The Problem

Cats are exceptionally good at hiding pain.

Unlike humans, cats cannot tell us when something hurts. As a result, pet owners often miss early warning signs of illness, injury, post-operative complications, or chronic pain. By the time symptoms become obvious, the condition may have already progressed.

Veterinary professionals use a research-backed methodology called the **Feline Grimace Scale (FGS)** to assess indicators of pain based on facial characteristics such as:

- Ear position
- Orbital tightening around the eyes
- Muzzle tension
- Whisker changes
- Head position

While effective, applying the scale consistently requires training and experience, making it difficult for everyday pet owners, shelters, rescue organizations, and foster caregivers to use.

## Our Vision

PurrSight brings clinically inspired pain assessment to every cat owner through approachable, explainable AI.

By combining computer vision and multimodal AI, PurrSight analyzes a photo of a cat and estimates where the animal may fall on the Feline Grimace Scale. Rather than replacing veterinary expertise, the system acts as an early detection and awareness tool that helps people recognize subtle indicators they might otherwise miss.

Our goal is simple:

> Help humans better understand animals that cannot speak for themselves.

## What We Built

PurrSight is an AI-assisted cat pain assessment application that:

- Accepts an uploaded photo of a cat
- Detects and analyzes facial features relevant to the Feline Grimace Scale
- Identifies potential indicators of discomfort or pain
- Produces an estimated pain score
- Explains the observations that contributed to the assessment
- Provides recommendations on potential next steps

The application focuses heavily on **explainability**.

Instead of producing a black-box prediction, PurrSight highlights the factors that influenced the assessment, including ear posture, eye narrowing, muzzle tension, whisker positioning, and general head posture. Users can understand not only the result, but also *why* the application produced that result.

### Built to know its limits

PurrSight declines to score an image rather than guess:

- If no cat, no clearly visible face, or inadequate image quality is detected, it asks for a better photo instead of producing a number.
- Individual features that aren't clearly visible are marked *not assessable* and excluded from the score, following the FGS's own scoring method.
- Results surface the known limits of the underlying research — the scale was validated on **acute** pain, and its validation study did not include flat-faced (brachycephalic) breeds.

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — build plan, architecture, and workstream split

## Attribution

The Feline Grimace Scale is © Université de Montréal.

> Evangelista, M.C., Watanabe, R., Leung, V.S.Y. et al. *Facial expressions of pain in cats: the development and validation of a Feline Grimace Scale.* **Scientific Reports** 9, 19128 (2019). https://doi.org/10.1038/s41598-019-55693-8

Learn more at [felinegrimacescale.com](https://www.felinegrimacescale.com/).

## Disclaimer

PurrSight is **not a diagnostic tool and is not a substitute for veterinary care.** It is an awareness aid intended to prompt earlier conversations with a veterinarian.

The Feline Grimace Scale was developed and validated for **acute** pain. A cat experiencing chronic pain may still score low. Never treat a low score as reassurance that your cat is healthy — if something seems wrong, contact a veterinarian.
