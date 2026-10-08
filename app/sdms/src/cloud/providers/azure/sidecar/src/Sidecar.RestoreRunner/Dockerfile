ARG DOTNET_ASPNET_VERSION=9.0-noble
ARG DOTNET_ASPNET_DIGEST=sha256:f6ca5cf8e277d5fd590ebeb0df890f1039ad8da0a953c94cb4ee8d3f2cae5dff

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_ASPNET_VERSION}@${DOTNET_ASPNET_DIGEST}

WORKDIR /app
COPY . .

USER $APP_UID
ENTRYPOINT ["dotnet", "Sidecar.RestoreRunner.dll"]
