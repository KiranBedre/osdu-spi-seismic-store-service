# Native container build action

Build contract for the `native-container-azure` archetype.

The service descriptor supplies the Docker build context and Dockerfile. The
Dockerfile must expose a target named `spi-test`. That target exports the
report at:

```text
/ctest.xml
```

The action builds `spi-test` on `linux/amd64`, exports the report, and rejects
missing, unreadable, failing, errored, or all-skipped JUnit evidence. The
verified report is retained as the `native-container-test-evidence` artifact.

A service Dockerfile normally uses this stage shape:

```dockerfile
FROM build-base AS spi-build
RUN cmake --build build
RUN ctest --test-dir build --output-on-failure --output-junit /spi-test/ctest.xml

FROM scratch AS spi-test
COPY --from=spi-build /spi-test/ctest.xml /ctest.xml

FROM runtime AS final
COPY --from=spi-build /install /opt/service
```

The deployable image must copy its installed artifacts from the tested build
stage. The normal image job runs only after this action succeeds.
