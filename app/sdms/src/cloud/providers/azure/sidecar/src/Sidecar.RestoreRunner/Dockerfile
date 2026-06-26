ARG DOTNET_ASPNET_VERSION=8.0
ARG DOTNET_SDK_VERSION=8.0

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_ASPNET_VERSION} AS base

WORKDIR /app

# Apply latest available package updates from the base image's repositories
RUN apt-get update && \
    apt-get upgrade -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_SDK_VERSION} AS build
ARG PASS
ARG ARTIFACTS_CREDPROVIDER_VERSION=v1.4.1

RUN curl -L https://raw.githubusercontent.com/Microsoft/artifacts-credprovider/${ARTIFACTS_CREDPROVIDER_VERSION}/helpers/installcredprovider.sh | sh
ARG FEED_ACCESSTOKEN
ENV VSS_NUGET_EXTERNAL_FEED_ENDPOINTS="{\"endpointCredentials\": [{\"endpoint\":\"https://pkgs.dev.azure.com/OpenEnergyPlatform/dcd9d9fe-a1ca-4b31-bb47-0364ffe4fca7/_packaging/AdmeNugetFeed/nuget/v3/index.json\", \"password\":\"${FEED_ACCESSTOKEN}\"}]}"

WORKDIR /src

ENV NUGET_CONFIG_FILE=/src/NuGet.config

COPY "Sidecar.Common/NuGet.config" "./NuGet.config"
COPY "Sidecar.Common/Sidecar.Common.csproj" "Sidecar.Common/Sidecar.Common.csproj"
COPY "Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj" "Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj"
RUN dotnet restore "Sidecar.Common/Sidecar.Common.csproj" --configfile $NUGET_CONFIG_FILE
RUN dotnet restore "Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj" --configfile $NUGET_CONFIG_FILE
COPY . .
RUN dotnet build "Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj" -c Release -o /app/build
RUN mkdir -p  ~/.aspnet/https/ && \
    dotnet dev-certs https -ep ~/.aspnet/https/aspnetapp.pfx -p ${PASS}
RUN dotnet dev-certs https --trust

FROM build AS publish
RUN dotnet publish "Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj" -c Release -o /app/publish /p:UseAppHost=false
RUN cp ~/.aspnet/https/aspnetapp.pfx /app/publish/.
RUN chmod 755 /app/publish/aspnetapp.pfx

FROM base AS final
ARG PASS
ENV ASPNETCORE_Kestrel__Certificates__Default__Password=${PASS}
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Sidecar.RestoreRunner.dll"]
