#!/usr/bin/env python3
"""Recognize text in one local image using macOS Vision through PyObjC."""

import json
import sys

import objc
from Foundation import NSURL


def main(path):
    objc.loadBundle('Vision', globals(), bundle_path='/System/Library/Frameworks/Vision.framework')
    request = VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(1)  # accurate
    request.setUsesLanguageCorrection_(False)
    request.setRecognitionLanguages_(['en-US'])
    request.setMinimumTextHeight_(0.003)
    handler = VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(path), {})
    if not handler.performRequests_error_([request], None):
        raise RuntimeError(f'Vision OCR failed for {path}')
    candidates = [observation.topCandidates_(1)[0] for observation in request.results() or [] if observation.topCandidates_(1)]
    candidates = [candidate for candidate in candidates if candidate.confidence() >= 0.3]
    return {
        'text': '\n'.join(candidate.string() for candidate in candidates),
        'confidence': sum(float(candidate.confidence()) for candidate in candidates) / len(candidates) if candidates else 0,
    }


if __name__ == '__main__':
    print(json.dumps(main(sys.argv[1]), ensure_ascii=False))
