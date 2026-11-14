#!/usr/bin/env python
import unittest

import utils as utils_module


class TestRunStateHelpers(unittest.TestCase):

    def test_watermark_from_iso_string(self):
        state = {'sp-a': '2026-01-01T00:00:00+00:00'}
        self.assertEqual(
            utils_module.get_incremental_watermark(state, 'sp-a'),
            '2026-01-01T00:00:00+00:00',
        )

    def test_watermark_from_legacy_structured_entry(self):
        state = {'sp-a': {'watermark': '2026-02-01T00:00:00+00:00', 'last_successful_run_at': 'ignored'}}
        self.assertEqual(
            utils_module.get_incremental_watermark(state, 'sp-a'),
            '2026-02-01T00:00:00+00:00',
        )

    def test_set_incremental_watermark_keeps_string_schema(self):
        state = {}
        utils_module.set_incremental_watermark(state, 'sp-b', '2026-11-04T00:00:00+00:00')
        self.assertEqual(state['sp-b'], '2026-11-04T00:00:00+00:00')

    def test_normalize_last_run_state_strips_structured_entries(self):
        state = {
            'sp-a': '2026-01-01T00:00:00+00:00',
            'sp-b': {'watermark': '2026-02-01T00:00:00+00:00', 'extra': 'drop-me'},
        }
        normalized = utils_module.normalize_last_run_state(state)
        self.assertEqual(normalized, {
            'sp-a': '2026-01-01T00:00:00+00:00',
            'sp-b': '2026-02-01T00:00:00+00:00',
        })


if __name__ == '__main__':
    unittest.main(verbosity=2)
