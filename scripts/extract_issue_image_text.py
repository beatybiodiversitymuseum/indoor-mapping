#!/usr/bin/env python3
"""Download GitHub ticket photos and OCR them locally with Tesseract and Pillow.

Only GitHub user-attachment asset URLs from map submissions are downloaded.
Original images remain in the chosen cache, outside the committed map package.
OCR text is evidence, not a verified transcription or a location inference.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--issues', required=True)
    parser.add_argument('--cache', required=True)
    parser.add_argument('--vision-executable', help='Compiled recognize_image_text.swift executable (macOS)')
    parser.add_argument('--output', default='reports/issue-image-transcriptions.json')
    args = parser.parse_args()
    cache = Path(args.cache).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    tasks = []
    for issue in json.loads(Path(args.issues).read_text()):
        if not re.match(r'Amenity(?: or Opening)?:', issue['title'], re.I):
            continue
        urls = dict.fromkeys(re.findall(r'https://github.com/user-attachments/assets/[a-zA-Z0-9-]+', issue.get('body') or ''))
        tasks.extend((issue, url) for url in urls)

    def extract(task):
        issue, url = task
        image = cache / (url.rsplit('/', 1)[-1] + '.image')
        result = dict(issue_number=issue['number'], issue_url=issue['url'], image_url=url, engine='Tesseract 5, page and sparse text, 2x image', review_status='machine_transcribed_unreviewed')
        try:
            if not image.exists():
                subprocess.run(['curl', '--location', '--fail', '--silent', '--show-error', '--max-time', '60', url, '--output', str(image)], check=True, capture_output=True)
            if args.vision_executable:
                output = subprocess.run([str(Path(args.vision_executable).resolve()), str(image)], check=True, capture_output=True, text=True)
                recognized = json.loads(output.stdout)
                result.update(text=recognized.get('text', ''), confidence=round(recognized.get('confidence', 0), 3), engine='Apple Vision accurate (en-US)')
                if 'error' in recognized:
                    result['error'] = recognized['error']
                return result
            large = image.with_suffix('.png')
            with Image.open(image) as source:
                source.resize((source.width * 2, source.height * 2)).save(large)
            versions = [subprocess.run(['tesseract', str(path), 'stdout', '--psm', mode], check=True, capture_output=True, text=True).stdout.strip() for path, mode in [(image, '3'), (large, '11')]]
            result['text'] = versions[0] if len(versions[0]) >= 50 else versions[1]
        except (OSError, subprocess.CalledProcessError) as error:
            result.update(text='', error=str(error))
        return result

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(extract, tasks))
    Path(args.output).write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(f'images={len(results)} errors={sum("error" in r for r in results)} with_text={sum(bool(r.get("text")) for r in results)}')


if __name__ == '__main__':
    main()
