# ComfyUI + vLLM-Omni on OpenShift

A self-service platform for deploying [ComfyUI](https://github.com/comfyanonymous/ComfyUI) with [vLLM-Omni](https://docs.vllm.ai/projects/vllm-omni/) image generation on OpenShift.

Users sign in with GitHub, create their own ComfyUI instances through a web portal, and generate images using models served by vLLM-Omni via a [LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy) gateway.

## Architecture

```
                       OpenShift Cluster
 ┌─────────────────────────────────────────────────────┐
 │                                                     │
 │  ┌──────────────────────┐                           │
 │  │  Self-Service Portal │◄── GitHub OAuth login     │
 │  │  (Node.js + React)   │                           │
 │  │  Manages ComfyUI     │                           │
 │  │  instances via Helm  │                           │
 │  └──────────┬───────────┘                           │
 │             │ helm install/uninstall                │
 │  ┌──────────▼──────────────────────────────────┐    │
 │  │  Per-User ComfyUI Deployments               │    │
 │  │                                             │    │
 │  │  ┌─────────────────┐ ┌─────────────────┐    │    │
 │  │  │ comfyui-alice   │ │ comfyui-bob     │    │    │
 │  │  │ nginx + Route   │ │ nginx + Route   │    │    │
 │  │  └────────┬────────┘ └────────┬────────┘    │    │
 │  └───────────┼───────────────────┼─────────────┘    │
 │              └─────────┬─────────┘                  │
 │                        │ OpenAI-compatible API      │
 │  ┌─────────────────────▼──────────────────────┐     │
 │  │  LiteLLM Proxy                             │     │
 │  │  Routes requests by model name             │     │
 │  │  Load balancing, retries, fallbacks        │     │
 │  └─────┬──────────────────────────────┬───────┘     │
 │        │                              │             │
 │  ┌─────▼──────────────────┐  ┌────────▼─────────┐   │
 │  │  KServe ISVC           │  │  KServe ISVC     │   │
 │  │  vLLM-Omni (GPU)       │  │  vLLM (CPU)      │   │
 │  │  Z-Image-Turbo         │  │  Qwen3-0.6B      │   │
 │  └────────────────────────┘  └──────────────────┘   │
 └─────────────────────────────────────────────────────┘
```

## Components

### Helm Charts

| Chart | Description |
|-------|-------------|
| `charts/vllm-omni` | Deploys a vLLM model as a KServe InferenceService with GPU or CPU resources and PVC model cache |
| `charts/comfyui` | Deploys a per-user ComfyUI instance with nginx basic auth sidecar, PVC persistence, and OpenShift Route. `VLLM_API_BASE_URL` points at the LiteLLM Proxy for model discovery |
| `charts/portal` | Deploys the self-service portal with GitHub OAuth, RBAC for managing Helm releases, and log streaming |
| `charts/litellm` | Deploys [LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy) as an OpenAI-compatible gateway that routes requests by model name to the correct vLLM backend |

### LiteLLM Proxy (`charts/litellm/`)

An [LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy) instance that sits between ComfyUI and the vLLM backends. It provides:

- **Model-based routing** -- routes requests to the correct backend based on the `model` field
- **OpenAI-compatible API** -- supports `/v1/chat/completions`, `/v1/images/generations`, `/v1/models`, and more
- **Load balancing** -- multiple routing strategies (round-robin, least-busy, latency-based)
- **Retries and fallbacks** -- automatic retry with exponential backoff

Configured via `values/litellm.yaml` using the [LiteLLM config format](https://docs.litellm.ai/docs/proxy/configs).

### Custom Nodes (`comfyui-vllm-omni/`)

Forked ComfyUI custom nodes that integrate with vLLM-Omni. On startup, the nodes query the LiteLLM Proxy's `/v1/models` endpoint for available models and populate a dropdown. All generation requests are sent through the proxy. The endpoint is configured via the `VLLM_API_BASE_URL` environment variable (defaults to `http://litellm:4000/v1`).

### Portal (`portal/`)

Node.js + React web application:
- **GitHub OAuth** login with username whitelist
- **Helm-based instance management** -- creates/deletes ComfyUI Helm releases
- **Live pod status** -- polls every 5s, shows Ready/Pending/CrashLoopBackOff badges
- **Log streaming** -- Server-Sent Events backed by `kubectl logs -f`
- **Route URL display** -- resolved from OpenShift Route objects
- **Per-instance credentials** -- generates a random password per instance, displayed on the dashboard

## Prerequisites

- OpenShift 4.17+
- NVIDIA GPU Operator installed and configured (for GPU models)
- KServe installed (via OpenShift AI or standalone)
- Helm 3.x
- Helmfile

## Quick Start

### 1. Deploy vLLM backends, LiteLLM Proxy, and the Portal

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

  - name: vllm-qwen3-06b
    namespace: my-namespace
    chart: ./charts/vllm-omni
    values:
      - values/vllm-qwen3-06b.yaml

  - name: portal
    namespace: my-namespace
    chart: ./charts/portal
    values:
      - values/portal.yaml
      - values/portal.local.yaml

  - name: litellm
    namespace: my-namespace
    chart: ./charts/litellm
    values:
      - values/litellm.yaml
```

```bash
helmfile -f helmfile.local.yaml apply
```

### 3. Build the Portal Image

The portal image is automatically built and pushed to `ghcr.io` by the CI pipeline on every push to `master`. To build manually:

```bash
podman build -t ghcr.io/your-org/comfyui-portal:latest -f portal/Dockerfile .
podman push ghcr.io/your-org/comfyui-portal:latest
```

## Chart Configuration

### vllm-omni

| Value | Default | Description |
|-------|---------|-------------|
| `image.repository` | `vllm/vllm-omni` | Container image |
| `image.tag` | `v0.16.0` | Image tag |
| `model.name` | `Tongyi-MAI/Z-Image-Turbo` | Model to serve (positional arg) |
| `model.extraArgs` | `[]` | Additional vLLM args |
| `resources.requests.cpu` | `"4"` | CPU request |
| `resources.requests.memory` | `16Gi` | Memory request |
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
| `auth.enabled` | `true` | Enable HTTP basic auth via nginx sidecar |
| `auth.username` | `comfyui` | Basic auth username |
| `auth.password` | `""` | Basic auth password (portal generates this automatically) |
| `extraEnv[0].value` | `http://litellm:4000/v1` | LiteLLM Proxy endpoint (`VLLM_API_BASE_URL`) |

### litellm

Configured via `values/litellm.yaml` using the [LiteLLM config format](https://docs.litellm.ai/docs/proxy/configs).

```yaml
config:
  model_list:
    - model_name: Tongyi-MAI/Z-Image-Turbo
      litellm_params:
        model: openai/Tongyi-MAI/Z-Image-Turbo
        api_base: http://vllm-omni-z-image-turbo-predictor:8080/v1
        api_key: none
    - model_name: Qwen/Qwen3-0.6B
      litellm_params:
        model: openai/Qwen/Qwen3-0.6B
        api_base: http://vllm-qwen3-06b-vllm-omni-predictor:8080/v1
        api_key: none
```

Each entry in `model_list` maps a `model_name` (used in API requests) to a backend via `api_base`. The `openai/` prefix tells LiteLLM to use the OpenAI-compatible provider.

### portal

| Value | Default | Description |
|-------|---------|-------------|
| `github.clientID` | `""` | GitHub OAuth App client ID |
| `github.clientSecret` | `""` | GitHub OAuth App client secret |
| `github.callbackURL` | `""` | OAuth callback URL |
| `sessionSecret` | `""` | Express session signing secret |
| `allowedGithubUsers` | `""` | Comma-separated whitelist (empty = deny all) |
| `helm.chartPath` | `/app/charts/comfyui` | Path to comfyui chart in container |

## Known Limitations

- **Model discovery cache does not auto-refresh.** The ComfyUI custom nodes query available models once at startup and cache the result. If models change after ComfyUI is already running, the pod must be restarted to pick up the new list.

- **Portal sessions are stored in-memory.** The Express session store is not backed by persistent storage. All user sessions are lost when the portal pod restarts (e.g. during a redeployment), requiring users to sign in again.

## CI

A GitHub Actions pipeline runs on every push and PR:

1. **helm-tests** -- runs chart unit tests (vllm-omni, comfyui, portal)
2. **portal-typecheck** -- TypeScript type-check, Vitest unit tests with coverage, and Vite build
3. **portal-image** -- builds and pushes to `ghcr.io` (master only)

To run tests locally:

```bash
helm unittest charts/vllm-omni/
helm unittest charts/comfyui/
helm unittest charts/portal/
cd portal && npx vitest run --coverage
```

## Project Structure

```
.
├── charts/
│   ├── vllm-omni/          # KServe InferenceService chart
│   ├── comfyui/             # Per-user ComfyUI chart
│   ├── portal/              # Self-service portal chart
│   └── litellm/             # LiteLLM Proxy chart
├── comfyui-vllm-omni/       # Forked custom nodes with model discovery
├── portal/                  # Portal app source (Express + React)
│   ├── Dockerfile
│   └── src/
│       ├── index.ts         # Server entry
│       ├── routes/api.ts    # Instance CRUD + log streaming
│       ├── services/helm.ts # Helm CLI wrapper
│       └── client/App.tsx   # React dashboard
├── values/                  # Deployment-specific overrides
│   ├── vllm-omni.yaml       # GPU model (Z-Image-Turbo)
│   ├── vllm-qwen3-06b.yaml  # CPU model (Qwen3-0.6B)
│   ├── litellm.yaml         # LiteLLM Proxy model routing config
│   └── portal.yaml          # Portal config
├── helmfile.yaml            # Production helmfile
└── helmfile.local.yaml      # Local override (gitignored)
```

## License

Apache License 2.0
