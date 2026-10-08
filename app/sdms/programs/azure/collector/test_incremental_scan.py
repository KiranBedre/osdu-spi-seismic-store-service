#!/usr/bin/env python
import sys
import types
import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

def _make_azure_stub():
    """Create a minimal azure.cosmos stub so the import succeeds."""
    azure_mod       = types.ModuleType('azure')
    cosmos_mod      = types.ModuleType('azure.cosmos')
    cosmos_mod.CosmosClient = MagicMock()
    azure_mod.cosmos        = cosmos_mod
    sys.modules['azure']        = azure_mod
    sys.modules['azure.cosmos'] = cosmos_mod

_make_azure_stub()

sys.path.insert(0, '.')
import cosmos as cosmos_module  # noqa: E402  (import after stub setup)

_parse  = cosmos_module._parse_last_modified_date
Dataset = cosmos_module.Dataset


def _make_cosmos_mock(items: list[dict]):
    """
    Return a patched CosmosClient whose query_items().by_page() yields
    a single page containing `items`.
    """
    mock_client    = MagicMock()
    mock_db        = MagicMock()
    mock_container = MagicMock()

    mock_client.get_database_client.return_value   = mock_db
    mock_db.get_container_client.return_value      = mock_container

    mock_container.query_items.return_value.by_page.return_value = [items]

    return mock_client

class TestParsLastModifiedDate(unittest.TestCase):
    """Unit tests for the JS-date-string parser."""

    def test_full_js_format(self):
        """Standard JS Date.toString() with timezone name in parentheses."""
        result = _parse("Thu Jul 16 2020 04:37:41 GMT+0000 (Coordinated Universal Time)")
        self.assertIsNotNone(result)
        self.assertEqual(result.year,   2020)
        self.assertEqual(result.month,  7)
        self.assertEqual(result.day,    16)
        self.assertEqual(result.hour,   4)
        self.assertEqual(result.minute, 37)
        self.assertEqual(result.second, 41)
        self.assertEqual(result.tzinfo, timezone.utc)

    def test_js_format_without_parenthetical(self):
        """JS date string without the trailing timezone name."""
        result = _parse("Thu Jul 16 2020 04:37:41 GMT+0000")
        self.assertIsNotNone(result)
        self.assertEqual(result.year, 2020)

    def test_empty_string_returns_none(self):
        result = _parse("")
        self.assertIsNone(result)

    def test_none_input_returns_none(self):
        result = _parse(None)
        self.assertIsNone(result)

    def test_unrecognized_format_returns_none(self):
        result = _parse("not a date at all")
        self.assertIsNone(result)

    def test_different_month(self):
        result = _parse("Mon Jan 01 2024 00:00:00 GMT+0000 (Coordinated Universal Time)")
        self.assertIsNotNone(result)
        self.assertEqual(result.month, 1)
        self.assertEqual(result.year,  2024)


class TestListDatasetsIncrementalFilter(unittest.TestCase):
    """
    Integration-style tests for list_datasets() with a mocked CosmosClient.

    Scenario
    --------
    Cosmos contains three datasets:
      - old_dataset   : last_modified_date  2020-07-16  (BEFORE since)  → must be excluded
      - new_dataset   : last_modified_date  2026-09-15  (AFTER  since)  → must be included
      - no_date_dataset: no last_modified_date field                     → must be included (safe fallback)

    since = "2026-01-01T00:00:00+00:00"
    """

    SINCE = "2026-01-01T00:00:00+00:00"

    COSMOS_ITEMS = [
        {
            'name': 'old_dataset',
            'path': '/path/old',
            'gcsurl': 'https://storage/old',
            'created_by': 'user1',
            'last_modified_date': 'Thu Jul 16 2020 04:37:41 GMT+0000 (Coordinated Universal Time)',
        },
        {
            'name': 'new_dataset',
            'path': '/path/new',
            'gcsurl': 'https://storage/new',
            'created_by': 'user2',
            'last_modified_date': 'Tue Sep 15 2026 10:00:00 GMT+0000 (Coordinated Universal Time)',
        },
        {
            'name': 'no_date_dataset',
            'path': '/path/nodate',
            'gcsurl': 'https://storage/nodate',
            'created_by': 'user3',
            # deliberately missing last_modified_date
        },
    ]

    def _run(self, since=None):
        mock_client = _make_cosmos_mock(self.COSMOS_ITEMS)
        with patch.object(cosmos_module.CosmosClient, 'from_connection_string',
                          return_value=mock_client):
            return cosmos_module.list_datasets('test-subproject', 'fake-cs', since=since)

    #  full scan (no since)
    def test_full_scan_returns_all_datasets(self):
        results = self._run(since=None)
        names = [d.name for d in results]
        self.assertIn('old_dataset',    names)
        self.assertIn('new_dataset',    names)
        self.assertIn('no_date_dataset', names)
        self.assertEqual(len(results), 3)

    # incremental scan (since provided)
    def test_incremental_excludes_old_dataset(self):
        """Dataset modified before `since` must NOT appear in results."""
        results = self._run(since=self.SINCE)
        names = [d.name for d in results]
        self.assertNotIn('old_dataset', names,
            "old_dataset (2020) should be filtered out — it predates since (2026-01-01)")

    def test_incremental_includes_new_dataset(self):
        """Dataset modified after `since` MUST appear in results."""
        results = self._run(since=self.SINCE)
        names = [d.name for d in results]
        self.assertIn('new_dataset', names,
            "new_dataset (Sep 2026) should be included — it postdates since (2026-01-01)")

    def test_incremental_includes_dataset_with_no_date(self):
        """Dataset with missing last_modified_date must be included (safe fallback)."""
        results = self._run(since=self.SINCE)
        names = [d.name for d in results]
        self.assertIn('no_date_dataset', names,
            "no_date_dataset has no date — should be included as safe fallback")

    def test_incremental_result_count(self):
        results = self._run(since=self.SINCE)
        self.assertEqual(len(results), 2,
            "Expected 2 datasets: new_dataset + no_date_dataset")

    # boundary: dataset modified exactly at since

    def test_dataset_modified_exactly_at_since_is_excluded(self):
        """A dataset modified exactly at the since boundary must be excluded (<=)."""
        items = [{
            'name': 'boundary_dataset',
            'path': '/path/boundary',
            'gcsurl': 'https://storage/boundary',
            'created_by': 'user4',
            'last_modified_date': 'Thu Jan 01 2026 00:00:00 GMT+0000 (Coordinated Universal Time)',
        }]
        mock_client = _make_cosmos_mock(items)
        with patch.object(cosmos_module.CosmosClient, 'from_connection_string',
                          return_value=mock_client):
            results = cosmos_module.list_datasets('test-subproject', 'fake-cs', since=self.SINCE)
        self.assertEqual(len(results), 0,
            "Dataset modified exactly at since should be excluded")

    def test_old_string_comparison_was_broken(self):
        """
        Prove that naïve string comparison would have wrongly INCLUDED the old
        dataset, i.e. 'Thu Jul...' > '2026-01-01...' is True (the original bug).
        """
        js_date  = 'Thu Jul 16 2020 04:37:41 GMT+0000 (Coordinated Universal Time)'
        iso_since = '2026-01-01T00:00:00+00:00'
        broken_result = js_date > iso_since
        self.assertTrue(broken_result,
            "Confirms the original bug: string comparison wrongly returns True for an old JS date")

    def test_new_datetime_comparison_is_correct(self):
        """
        The fixed code correctly identifies the old dataset as predating since.
        """
        js_date   = 'Thu Jul 16 2020 04:37:41 GMT+0000 (Coordinated Universal Time)'
        iso_since = '2026-01-01T00:00:00+00:00'
        item_dt   = _parse(js_date)
        since_dt  = datetime.fromisoformat(iso_since).astimezone(timezone.utc)
        self.assertIsNotNone(item_dt)
        self.assertLessEqual(item_dt, since_dt,
            "Fixed comparison correctly identifies old dataset as not newer than since")


if __name__ == '__main__':
    unittest.main(verbosity=2)
