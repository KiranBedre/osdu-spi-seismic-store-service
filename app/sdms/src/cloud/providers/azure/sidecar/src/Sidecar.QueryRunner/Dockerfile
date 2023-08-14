ARG PASS

FROM mcr.microsoft.com/dotnet/aspnet:6.0-focal AS base

WORKDIR /app
EXPOSE 7138

# Creates a non-root user with an explicit UID and adds permission to access the /app folder
# For more info, please refer to https://aka.ms/vscode-docker-dotnet-configure-containers
RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

FROM mcr.microsoft.com/dotnet/sdk:6.0-focal AS build
ARG PASS
WORKDIR /src
COPY ["Sidecar.csproj", "./"]
RUN dotnet restore "Sidecar.csproj"
COPY . .
RUN dotnet build "Sidecar.csproj" -c Release -o /app/build
RUN dotnet dev-certs https -ep ~/.aspnet/https/aspnetapp.pfx -p ${PASS}
RUN dotnet dev-certs https --trust

FROM build AS publish
RUN dotnet publish "Sidecar.csproj" -c Release -o /app/publish /p:UseAppHost=false
RUN cp ~/.aspnet/https/aspnetapp.pfx /app/publish/.
RUN chmod 755 /app/publish/aspnetapp.pfx

FROM base AS final
ARG PASS
ENV ASPNETCORE_Kestrel__Certificates__Default__Password=${PASS}
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Sidecar.dll"]