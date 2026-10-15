# Agent policy: exhibit image replacement

This policy applies when an agent adds or changes an issue-submitted exhibit image in `geojson/exhibit.geojson`. The goal is to keep the displayed image and searchable exhibit text in agreement. See `docs/issue-photo-mapping.md` for the current batch and commands.

## Decide whether to use an incoming image

1. Match the issue to one exhibit by its explicit location or public reference code. Do not infer a match from OCR alone. Preserve the feature ID, geometry, fixture and navigation associations, and archive reference code.
2. If the exhibit has no primary image, use the incoming image when the issue and image identify the same exhibit unambiguously. Record the issue and selected image URL. If the match is ambiguous or multiple incoming images compete for that slot, put them in a review list.
3. If a primary image already exists, compare the current and incoming images. Do not replace it without a recorded per-image approval. Present the images side by side with a checkable choice, and leave unchecked images unchanged. A prior approval for a different image or issue does not transfer.
4. An approved blank or placeholder image is still an approved replacement. Do not restore an older image because the selected image has less content. Detect exact duplicate files so they can be described accurately, but do not treat different URLs as proof of different content.
5. Store only the selected primary image in `image.url`. Keep issue provenance in `source_image_urls` as appropriate. Never let an unapproved incoming image silently become primary through a rebuild.

## Replace searchable text with the image

1. Run OCR on every accepted primary image, including images that appear blank. Store the image URL, issue number, engine, raw result, and review status in `image_transcriptions`. OCR output is evidence, not visitor-facing text.
2. Inspect the selected image and correct OCR errors by eye. Transcribe readable exhibit prose and captions, including scientific and common names. Do not invent clipped or illegible words. Exclude unrelated signs, background displays, and OCR noise. If a detail image makes text legible, use it only when it is part of the approved image set for that exhibit.
3. Use the existing property structure: exhibit prose in `details.text.en`, reviewed label/caption text in `photo_text`, identified organisms in `specimens`, and supported classifications in `taxonomy`. Keep specimen object keys and taxonomy value shapes consistent with neighboring records. Avoid copying the full OCR dump into search.
4. Review **every** old searchable image-derived field when replacing an image. Remove or rewrite `details.notes`, `details.text.en`, `photo_text`, `specimens`, and `taxonomy` entries that the selected image does not support. Do not carry forward an old panel's text just because the reference code is the same. If the selected image has no legible exhibit text, use an empty `details.text.en`, empty `photo_text`, and empty `specimens`; remove unsupported taxonomy and notes. Keep the image and stable map metadata.
5. Set `photo_text_source_url` to the selected `image.url` and `photo_text_review_status` to the reviewed outcome. Search must consume reviewed fields, not raw OCR. Whenever the primary URL changes, repeat OCR and text review before considering the replacement complete.

## Make the change reviewable

- Record each choice as empty-slot acceptance, approved replacement, or pending replacement, with current and incoming image links for pending cases. Do not interpret silence as approval.
- Check that each accepted image has an OCR record and a matching `photo_text_source_url`; verify that every blank image has no unsupported searchable content. Review the rendered exhibit card and search behavior for representative prose, specimen, and blank cases.
- Run `python3 scripts/validate_geojson.py` and `npm run check`. Report any legibility limits or pending approvals plainly.
- The current `scripts/apply_approved_issue_image_text.py` is a curated batch for its recorded 50 images. Before reusing it for a later batch, update its reviewed entries and coverage assertions against the newly selected URLs. Do not rerun historical text onto changed images.
