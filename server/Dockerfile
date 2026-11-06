# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:24-slim AS web
WORKDIR /src
COPY VERSION ./
COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci
COPY app/ ./app/
RUN cd app && npx expo export --platform web --output-dir /out/web

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS server
ARG TARGETARCH
WORKDIR /src
COPY VERSION ./
COPY server/Kcal.Server/Kcal.Server.csproj ./server/Kcal.Server/
RUN dotnet restore ./server/Kcal.Server/Kcal.Server.csproj -a $TARGETARCH
COPY server/ ./server/
RUN dotnet publish ./server/Kcal.Server/Kcal.Server.csproj -c Release -a $TARGETARCH --no-restore -o /out/server

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /out/server ./
COPY --from=web /out/web ./wwwroot
# CI puts kcal.apk into artifacts/apk/ first; otherwise the folder only holds .gitkeep
COPY artifacts/apk/ ./downloads/
COPY server/docker/kcal /usr/local/bin/kcal
RUN chmod 755 /usr/local/bin/kcal && mkdir -p /data && chown $APP_UID /data
USER $APP_UID
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    Kcal__DataDir=/data
EXPOSE 8080
VOLUME /data
ENTRYPOINT ["dotnet", "Kcal.Server.dll"]
