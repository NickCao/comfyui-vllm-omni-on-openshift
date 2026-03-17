"""
Discover vLLM-Omni InferenceService instances via the Kubernetes API.

Uses the in-cluster service account token to query KServe
InferenceService resources in the current namespace.
"""

import json
import os
from typing import Dict, List
from urllib.request import Request, urlopen
from urllib.error import URLError


def _get_namespace() -> str:
    """Read the pod's namespace from the mounted service account."""
    try:
        with open("/var/run/secrets/kubernetes.io/serviceaccount/namespace") as f:
            return f.read().strip()
    except FileNotFoundError:
        return os.environ.get("POD_NAMESPACE", "default")


def _get_token() -> str:
    """Read the in-cluster service account token."""
    with open("/var/run/secrets/kubernetes.io/serviceaccount/token") as f:
        return f.read().strip()


def _get_ca_path() -> str:
    return "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"


def _extract_model_name(item: dict) -> str:
    """Extract the model name from an InferenceService's container args.

    The vLLM-Omni chart passes the model as the first positional arg
    (e.g. "Tongyi-MAI/Z-Image-Turbo").
    """
    try:
        containers = item["spec"]["predictor"]["containers"]
        for container in containers:
            for arg in container.get("args", []):
                # Skip flags (--port, --omni, etc.)
                if not arg.startswith("-"):
                    return arg
    except (KeyError, IndexError):
        pass
    return item["metadata"]["name"]


def discover_vllm_omni_instances() -> Dict[str, str]:
    """
    Query the K8s API for InferenceService resources and return a mapping
    of model name to base URL.

    Returns:
        Dict mapping model names to service URLs, e.g.:
        {"Tongyi-MAI/Z-Image-Turbo": "http://vllm-omni-z-image-turbo-predictor.ncao.svc.cluster.local:8080"}
    """
    namespace = _get_namespace()
    api_host = os.environ.get("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")
    api_port = os.environ.get("KUBERNETES_SERVICE_PORT", "443")
    api_url = (
        f"https://{api_host}:{api_port}"
        f"/apis/serving.kserve.io/v1beta1/namespaces/{namespace}/inferenceservices"
    )

    try:
        token = _get_token()
    except FileNotFoundError:
        print("[vLLM-Omni Discovery] Not running in-cluster, skipping K8s discovery")
        return {}

    import ssl
    ctx = ssl.create_default_context(cafile=_get_ca_path())

    req = Request(api_url, headers={"Authorization": f"Bearer {token}"})

    try:
        with urlopen(req, context=ctx, timeout=5) as resp:
            data = json.loads(resp.read())
    except (URLError, OSError) as e:
        print(f"[vLLM-Omni Discovery] Failed to query K8s API: {e}")
        return {}

    instances: Dict[str, str] = {}
    for item in data.get("items", []):
        name = item["metadata"]["name"]
        model_name = _extract_model_name(item)
        url = f"http://{name}-predictor.{namespace}.svc.cluster.local:8080"
        instances[model_name] = url

    if instances:
        print(f"[vLLM-Omni Discovery] Found {len(instances)} model(s): {list(instances.keys())}")
    else:
        print("[vLLM-Omni Discovery] No InferenceService resources found")

    return instances


# Module-level cache populated on import
_cached_instances: Dict[str, str] = {}


def get_instances() -> Dict[str, str]:
    """Return cached instances, discovering on first call."""
    global _cached_instances
    if not _cached_instances:
        _cached_instances = discover_vllm_omni_instances()
    return _cached_instances


def refresh_instances() -> Dict[str, str]:
    """Force re-discovery of instances."""
    global _cached_instances
    _cached_instances = discover_vllm_omni_instances()
    return _cached_instances


def get_instance_names() -> List[str]:
    """Return list of model names for ComfyUI enum fields."""
    instances = get_instances()
    return list(instances.keys()) if instances else ["(no models found)"]


def get_instance_url(model_name: str) -> str:
    """Resolve a model name to its service URL."""
    instances = get_instances()
    return instances.get(model_name, "http://localhost:8000")
