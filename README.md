# ComfyUI + vLLM-Omni on OpenShift

A self-service platform for deploying [ComfyUI](https://github.com/comfyanonymous/ComfyUI) with [vLLM-Omni](https://docs.vllm.ai/projects/vllm-omni/) image generation on OpenShift.

Users sign in with GitHub, create their own ComfyUI instances through a web portal, and generate images using models served by vLLM-Omni via KServe.

## Architecture

```
                        OpenShift Cluster
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │  ┌──────────────────────┐                            │
  │  │  Self-Service Portal │◄── GitHub OAuth login      │
  │  │  (Node.js + React)   │                            │
  │  │                      │                            │
  │  │  Manages ComfyUI     │                            │
  │  │  instances via Helm  │                            │
  │  └──────────┬───────────┘                            │
  │             │ helm install/uninstall                  │
  │  ┌──────────▼───────────────────────────────────┐    │
  │  │  Per-User ComfyUI Deployments                │    │
  │  │                                              │    │
  │  │  ┌──────────────────┐ ┌──────────────────┐   │    │
  │  │  │ comfyui-alice    │ │ comfyui-bob      │   │    │
  │  │  │ Route + PVC      │ │ Route + PVC      │   │    │
  │  │  └────────┬─────────┘ └────────┬─────────┘   │    │
  │  └───────────┼────────────────────┼──────────────┘    │
  │              └────────┬───────────┘                   │
  │                       │ K8s API discovery             │
  │  ┌────────────────────▼───────────────────┐          │
  │  │  KServe InferenceService               │          │
  │  │  vLLM-Omni (GPU)                       │          │
  │  │  e.g. Tongyi-MAI/Z-Image-Turbo         │          │
  │  │  PVC: model cache                      │          │
  │  └────────────────────────────────────────┘          │
  └──────────────────────────────────────────────────────┘
```

## Components

### Helm Charts

| Chart | Description |
|-------|-------------|
| `charts/vllm-omni` | Deploys vLLM-Omni as a KServe InferenceService with GPU resources and PVC model cache |
| `charts/comfyui` | Deploys a ComfyUI instance with PVC persistence, OpenShift Route, and RBAC for model discovery |
| `charts/portal` | Deploys the self-service portal with GitHub OAuth, RBAC for managing Helm releases, and log streaming |

### Custom Nodes (`comfyui-vllm-omni/`)

Forked ComfyUI custom nodes that integrate with vLLM-Omni. Key addition: **K8s-based model discovery** -- on startup, nodes query the KServe API for `InferenceService` resources and populate a dropdown with available model names (e.g. `Tongyi-MAI/Z-Image-Turbo`) instead of requiring users to manually enter service URLs.

### Portal (`portal/`)

Node.js + React web application:
- **GitHub OAuth** login with username whitelist
- **Helm-based instance management** -- creates/deletes ComfyUI Helm releases
- **Live pod status** -- polls every 5s, shows Ready/Pending/CrashLoopBackOff badges
- **Log streaming** -- Server-Sent Events backed by `kubectl logs -f`
- **Route URL display** -- resolved from OpenShift Route objects

## Prerequisites

- OpenShift 4.17+
- NVIDIA GPU Operator installed and configured
- KServe installed (via OpenShift AI or standalone)
- Helm 3.x
- Helmfile
- A GitHub OAuth App (for the portal)

## Quick Start

### 1. Deploy vLLM-Omni and the Portal

```bash
# Edit values for your cluster
cp values/portal.yaml values/portal.local.yaml
# Set: github.clientID, github.clientSecret, github.callbackURL,
#      sessionSecret, allowedGithubUsers, image.repository

# Deploy
helmfile apply
```

### 2. Local Override (different namespace)

For deploying to a non-default namespace, create a `helmfile.local.yaml`:

```yaml
releases:
  - name: vllm-omni-z-image-turbo
    namespace: my-namespace
    chart: ./charts/vllm-omni
    values:
      - values/vllm-omni.yaml

  - name: portal
    namespace: my-namespace
    chart: ./charts/portal
    values:
      - values/portal.yaml
      - values/portal.local.yaml
```

```bash
helmfile -f helmfile.local.yaml apply
```

### 3. Build the Portal Image

```bash
podman build -t quay.io/your-org/comfyui-portal:latest -f portal/Dockerfile .
podman push quay.io/your-org/comfyui-portal:latest
```

## Chart Configuration

### vllm-omni

| Value | Default | Description |
|-------|---------|-------------|
| `image.repository` | `vllm/vllm-omni` | Container image |
| `image.tag` | `v0.16.0` | Image tag |
| `model.name` | `Tongyi-MAI/Z-Image-Turbo` | Model to serve (positional arg) |
| `model.extraArgs` | `[]` | Additional vLLM args |
| `resources.requests.nvidia.com/gpu` | `"1"` | GPU request |
| `modelCache.size` | `50Gi` | PVC size for model weights |
| `inferenceService.deploymentMode` | `RawDeployment` | `RawDeployment` or `Serverless` |
| `huggingface.token` | `""` | HF token for gated models |

### comfyui

| Value | Default | Description |
|-------|---------|-------------|
| `image.repository` | `yanwk/comfyui-boot` | Container image |
| `image.tag` | `cpu` | Image tag |
| `cliArgs` | `--cpu` | Extra CLI args |
| `persistence.size` | `10Gi` | PVC size for user data |
| `route.enabled` | `true` | Create OpenShift Route |
| `customNodes.vllmOmni.enabled` | `true` | Auto-install vLLM-Omni custom nodes |

### portal

| Value | Default | Description |
|-------|---------|-------------|
| `github.clientID` | `""` | GitHub OAuth App client ID |
| `github.clientSecret` | `""` | GitHub OAuth App client secret |
| `github.callbackURL` | `""` | OAuth callback URL |
| `sessionSecret` | `""` | Express session signing secret |
| `allowedGithubUsers` | `""` | Comma-separated whitelist (empty = deny all) |
| `helm.chartPath` | `/app/charts/comfyui` | Path to comfyui chart in container |

## Running Tests

```bash
# vllm-omni chart (37 tests)
helm unittest charts/vllm-omni/

# comfyui chart (29 tests)
helm unittest charts/comfyui/
```

## Project Structure

```
.
├── charts/
│   ├── vllm-omni/          # KServe InferenceService chart
│   ├── comfyui/             # Per-user ComfyUI chart
│   └── portal/              # Self-service portal chart
├── comfyui-vllm-omni/       # Forked custom nodes with K8s discovery
├── portal/                  # Portal app source (Express + React)
│   ├── Dockerfile
│   └── src/
│       ├── index.ts         # Server entry
│       ├── routes/api.ts    # Instance CRUD + log streaming
│       ├── services/helm.ts # Helm CLI wrapper
│       └── client/App.tsx   # React dashboard
├── values/                  # Deployment-specific overrides
├── helmfile.yaml            # Production helmfile
└── helmfile.local.yaml      # Local override (gitignored)
```

## License

Apache License 2.0
