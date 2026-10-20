FROM golang:1.24-alpine AS build

WORKDIR /src
COPY . .

# The module has no dependencies, so there is nothing to download and no go.sum to copy.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

# A statically linked binary needs nothing else: no shell, no package manager, and no CA
# certificates, since the service makes no outbound calls.
FROM scratch

COPY --from=build /server /server

USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/server"]
