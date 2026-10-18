# Python build action

Build contract for the `python-fastapi-azure` and `airflow-dag-azure`
archetypes.

The action installs `requirements.txt`, installs `requirements-tests.in`
under the runtime constraints, and runs the fork-owned `.spi/ci/build.sh`.
That script must write:

- `.spi/results/test-results.xml`
- `.spi/results/coverage.xml`

Keeping the commands in the fork lets an upstream Python service retain its
own lint and test layout while the template consistently validates evidence.

For `airflow-dag-azure`, the action also installs the exact declared Airflow
version under its official Python constraints. After the fork build script
finishes, an Airflow `DagBag` parses the declared DAG file. The action fails on
any import error or when the declared DAG ID is absent, and publishes
`.spi/results/airflow-dag.json` with the parsed IDs and errors.
