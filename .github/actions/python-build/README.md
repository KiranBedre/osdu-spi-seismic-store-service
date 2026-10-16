# Python build action

Build contract for the `python-fastapi-azure` archetype.

The action installs `requirements.txt`, installs `requirements-tests.in`
under the runtime constraints, and runs the fork-owned `.spi/ci/build.sh`.
That script must write:

- `.spi/results/test-results.xml`
- `.spi/results/coverage.xml`

Keeping the commands in the fork lets an upstream Python service retain its
own lint and test layout while the template consistently validates evidence.
