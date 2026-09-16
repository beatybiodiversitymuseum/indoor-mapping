#!/usr/bin/env python3
"""Normalize window OCR into the existing exhibit narrative/specimen structure.

Only split clearly numbered specimen entries with a binomial name. Unrecognized
text is omitted from visitor fields; raw OCR remains available internally.
"""
import json
import re
from pathlib import Path


def readable_photo(record):
    text = record.get('text', '').strip()
    words = re.findall(r"[A-Za-z]+", text)
    if record.get('confidence', 0) < .97 or len(words) < 4:
        return False
    if sum(char.isalpha() for char in text) / max(len(text), 1) < .6:
        return False
    # Handwritten collection tags can have high OCR confidence despite nonsense.
    if re.search(r'(?im)^(Family:|Famile:|So Lies:|Species:)', text):
        return False
    return len(words) >= 8 or bool(re.search(r'(?m)^[A-Z][a-z]+ [a-z]+\nNo\.', text))


def select_photo(records):
    candidates = [(index, record) for index, record in enumerate(records) if readable_photo(record)]
    # Attachments after the overview are detail views of this same window.
    details = [(index, record) for index, record in candidates if index > 0]
    return max(details or candidates, key=lambda pair: (pair[1].get('confidence', 0), len(pair[1]['text'])), default=(None, None))[1]


def structure_text(text):
    # OCR sometimes reads the numbered fifth entry as S. Only accept it
    # when followed by a common-name line and a scientific-name line.
    text = re.sub(r'(?m)^S\. (?=[^\n]+\n[A-Z][a-z]+ [a-z]+\s*$)', '5. ', text)
    sections = re.split(r'(?m)^\s*\d+[.)]\s+', text)
    if len(sections) < 2:
        return {'text': {'en': text}}, []
    specimens = []
    for section in sections[1:]:
        lines = [line.strip() for line in section.splitlines() if line.strip()]
        scientific = next((i for i, line in enumerate(lines[:2])
                           if i == 1 and re.match(r'^(?:[A-Z][a-z]+ [a-z][a-z-]+(?:$|\s)|[A-Z][a-z]+idae$)', line)), None)
        # Omit unclear specimen blocks rather than displaying raw OCR fragments.
        if scientific is None:
            continue
        name_match = re.match(r'^([A-Z][a-z]+ [a-z][a-z-]+|[A-Z][a-z]+idae)(.*)$', lines[scientific])
        if name_match[2].strip():
            continue  # Garbled scientific-name lines are not visitor content.
        remaining = lines[scientific + 1:]
        catalog = next((line for line in remaining if re.match(r'^No\.\s*\S+', line)), None)
        specimens.append({
            'scientificName': name_match[1],
            'commonName': ' '.join(lines[:scientific]) or None,
            'specimenType': None,
            'presence': None,
            'catalogNumber': re.sub(r'^No\.\s*', '', catalog) if catalog else None,
            'notes': '\n'.join(line for line in remaining if line != catalog) or None,
        })
    return {'text': {'en': sections[0].strip()}}, specimens


def normalize(props):
    best = select_photo(props.get('image_transcriptions', []))
    props['photo_text'] = best['text'] if best else ''
    props['photo_text_source_url'] = best['image_url'] if best else None
    props['details'], props['specimens'] = structure_text(props['photo_text'])
    # Search indexes the same cleaned content visitors see.
    props['photo_text'] = '\n'.join([props['details']['text']['en']] + [
        '\n'.join(str(value) for value in specimen.values() if value)
        for specimen in props['specimens']]).strip()
    props['fixture_id'] = next(iter(props.get('fixture_ids', [])), None)
    props['amenity_id'] = next(iter(props.get('amenity_ids', [])), None)


if __name__ == '__main__':
    path = Path('geojson/exhibit.geojson')
    data = json.loads(path.read_text())
    for feature in data['features']:
        if feature['properties'].get('exhibit_type') == 'window':
            normalize(feature['properties'])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
