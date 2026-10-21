# CodeQL language detection

`detect.sh` prints the JSON language array consumed by the CodeQL workflow.
It detects source in the repository-owned `.spi` directory while excluding
other root hidden directories and generated dependency or build directories.
The workflow explicitly includes `.spi` in the CodeQL scan paths because
interpreted-language extractors skip hidden directories by default.

Modern JavaScript and TypeScript module extensions are included. When no
language is detected, the OSDU Java default remains in effect. GitHub Actions
analysis is always included because every repository receives the template
workflows.
