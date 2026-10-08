ARG PASS

FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble AS base

WORKDIR /app
EXPOSE 7138

RUN apt-get update && apt-get install -y adduser

# Creates a non-root user with an explicit UID and adds permission to access the /app folder
# For more info, please refer to https://aka.ms/vscode-docker-dotnet-configure-containers
RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

FROM mcr.microsoft.com/dotnet/sdk:9.0-noble AS build
ARG PASS
WORKDIR /src
COPY "Sidecar.Common/Sidecar.Common.csproj" "Sidecar.Common/Sidecar.Common.csproj"
COPY "Sidecar.QueryRunner/Sidecar.QueryRunner.csproj" "Sidecar.QueryRunner/Sidecar.QueryRunner.csproj"
RUN dotnet restore "Sidecar.Common/Sidecar.Common.csproj"
RUN dotnet restore "Sidecar.QueryRunner/Sidecar.QueryRunner.csproj"
COPY . .
RUN dotnet build "Sidecar.QueryRunner/Sidecar.QueryRunner.csproj" -c Release -o /app/build
RUN mkdir -p ~/.aspnet/https
RUN dotnet dev-certs https -ep ~/.aspnet/https/aspnetapp.pfx -p ${PASS}
RUN dotnet dev-certs https --trust

FROM build AS publish
RUN dotnet publish "Sidecar.QueryRunner/Sidecar.QueryRunner.csproj" -c Release -o /app/publish /p:UseAppHost=false
RUN cp ~/.aspnet/https/aspnetapp.pfx /app/publish/.
RUN chmod 755 /app/publish/aspnetapp.pfx

FROM base AS final
ARG PASS
ENV ASPNETCORE_Kestrel__Certificates__Default__Password=${PASS}
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Sidecar.QueryRunner.dll"]
