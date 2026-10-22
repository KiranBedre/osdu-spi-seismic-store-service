# Airflow DAG artifact action

Airflow DAG repositories produce `.spi/artifacts/dag.zip`,
`.spi/artifacts/dag.zip.sha256`, and `.spi/artifacts/workflow.json`. This
action validates that contract and, on a trusted workflow lane, publishes the
three files to `ghcr.io/<owner>/<service>-dag` as an OCI artifact.

The published manifest uses media type
`application/vnd.osdu.airflow.dag.v1`. Each commit is tagged
`sha-<12-character-commit>` and release automation copies the same manifest to
the semantic version tag without rebuilding it.
