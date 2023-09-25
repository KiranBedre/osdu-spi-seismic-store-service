# Service Client Libraries Generator

This package generates, patches and packages client libraries using [swagger-codegen-3.0](https://swagger.io/tools/swagger-codegen/) and [openapi-generator](https://openapi-generator.tech/) for different programming languages:

1. [Typescript](https://www.typescriptlang.org/) using [Axios](https://axios-http.com/)
<!-- 2. [Python](https://www.python.org/) -->
<!-- 3. [Go](https://go.dev/) -->
<!-- 4. [Java](https://www.java.com/) -->
<!-- 5. [C++](https://cplusplus.com/) using [Qt](https://www.qt.io/) -->

<div align="left">

[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)&nbsp;&nbsp;
<!-- [![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)](https://www.python.org/)&nbsp;&nbsp;&nbsp;
[![Go](https://img.shields.io/badge/go-%2300ADD8.svg?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)&nbsp;&nbsp;&nbsp;
[![Java](https://img.shields.io/badge/java-%23ED8B00.svg?style=for-the-badge&logo=openjdk&logoColor=white)](https://www.java.com/)&nbsp;&nbsp;&nbsp;
[![C++](https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white)](https://cplusplus.com/)&nbsp;&nbsp;&nbsp; -->

</div>

## How to Build the client libraries

To build the client libraries just execute the main generator script:

```bash
chmod +x ./generator.sh && ./generator.sh
```

The script will automatically generates client libraries for all supported languages. To modify the script execution, some configurations can be changed via environment variables. We recommend to not set these and let the script use default values:

- **YAML_INPUT_FILE**: The reference openapi document. default value ../dist/docs/openapi.yaml
- **YAML_OUTPUT_FILE**: The name of the output openapi document updated by the script. default value: cli-openapi.yaml
- **MODELS_SOURCE_REPOSITORY**: The data definition models source reference. default value: [data-definitions-master.zip](https://community.opengroup.org/osdu/data/data-definitions/-/archive/master/data-definitions-master.zip)
- **MODELS_OUTPUT_ZIP**: The output zip file name for the downloaded models. default value: data-definitions-master.zip
- **MODELS_LOCAL_DIRECTORY**: The output directory where to unzip the downloaded models. default value: data-definitions
- **SWAGGER_CODEGEN_CLI_VERSION** The version of the swagger codegen cli tool used to generate the client libraries. default value: 3.0.46
