import unittest

from audit_exhibit_images import codes, feature_codes, flag_identity_conflicts, inventory, match_sources, ocr_overlap


class AuditExhibitImagesTests(unittest.TestCase):
    def test_inventory_uses_full_size_anchor_not_thumbnail(self):
        html = '<a href="Face37/24.25.jpg"><img src="Face37/24.25sml.jpg" alt="37.24"></a>'
        items = inventory('labels', html)
        self.assertEqual(len(items), 1)
        self.assertEqual(codes(items[0]), ['37.24', '37.25'])
        self.assertTrue(items[0]['url'].endswith('/Face37/24.25.jpg'))

    def test_explicit_path_beats_code_and_combined_panel_is_shared(self):
        sources = inventory('labels', '<a href="Face37/24.25.jpg"><img src="x.jpg"></a>'
                                      '<a href="Face37/24.jpg"><img src="y.jpg"></a>')
        features = [
            {'id': 'a', 'properties': {'archive': {'collection': 'labels', 'public_reference_code': '37.24'},
                                     'image': {'path': 'labels/Face37/24.jpg'}}},
            {'id': 'b', 'properties': {'archive': {'collection': 'labels', 'public_reference_code': '37.25'},
                                     'image': {'url': 'https://github.com/user-attachments/assets/x'}}},
        ]
        rows = match_sources(features, sources)
        self.assertEqual(rows[0]['match_basis'], 'exact_path')
        self.assertEqual(len(rows[0]['source_urls']), 1)
        self.assertTrue(rows[1]['source_urls'][0].endswith('24.25.jpg'))

    def test_ambiguous_code_stays_for_review(self):
        sources = inventory('windows', '<a href="A/41-22U.JPG"><img src="a.jpg"></a>'
                                       '<a href="B/41-22L.JPG"><img src="b.jpg"></a>')
        feature = {'id': 'w', 'properties': {'archive': {'public_reference_code': '41.22'},
                                          'image': {'type': 'window', 'url': 'https://example.test/current.jpg'}}}
        self.assertEqual(match_sources([feature], sources)[0]['status'], 'ambiguous')
        self.assertIn('41.22', feature_codes(feature['properties']))

    def test_ocr_overlap_is_evidence_only(self):
        self.assertEqual(ocr_overlap('Viperfish Chauliodus sloani', 'Chauliodus sloani'), 0.667)

    def test_cross_record_ocr_match_flags_identity_conflict(self):
        rows = [
            {'collection': 'labels', 'reference_code': '01.06', 'source_urls': ['https://x/06.jpg'],
             'status': 'review_needed', 'current_image': {'ocr_raw': 'Bison bison American bison'},
             'source_image': {'ocr_raw': 'Water buffalo Bubalus bubalis'}},
            {'collection': 'labels', 'reference_code': '01.07', 'source_urls': ['https://x/07.jpg'],
             'status': 'review_needed', 'current_image': {'ocr_raw': 'Water buffalo Bubalus bubalis'},
             'source_image': {'ocr_raw': 'Common eland Taurotragus oryx'}},
        ]
        flag_identity_conflicts(rows)
        self.assertEqual(rows[1]['status'], 'identity_conflict')
        self.assertEqual(rows[1]['possible_source_code'], '01.06')


if __name__ == '__main__':
    unittest.main()
