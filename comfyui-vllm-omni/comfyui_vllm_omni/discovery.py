"""
Discover vLLM model instances for ComfyUI.

Queries the endpoint specified by the VLLM_API_BASE_URL environment
variable (typically a vLLM Semantic Router) for available models via
its /v1/models endpoint.
"""

import json
import os
from typing import Dict, List
from urllib.request import Request, urlopen
from urllib.error import URLError

_DEFAULT_BASE_URL = "http://litellm:4000/v1"


def discover() -> Dict[str, str]:
    """
    Query the /v1/models endpoint for available models.

    Returns:
        Dict mapping model IDs to the base URL.
    """
    base_url = os.environ.get("VLLM_API_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")
    models_url = f"{base_url}/models"

    try:
        req = Request(models_url)
        with urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
    except (URLError, OSError) as e:
        print(f"[vLLM Discovery] Failed to query {models_url}: {e}")
        return {}

    instances: Dict[str, str] = {}
    for model in data.get("data", []):
        model_id = model.get("id", "")
        if model_id:
            instances[model_id] = base_url

    if instances:
        print(f"[vLLM Discovery] Found {len(instances)} model(s) at {base_url}: {list(instances.keys())}")
    else:
        print(f"[vLLM Discovery] No models found at {base_url}")

    return instances


_cache: Dict[str, str] = {}


def get_instances() -> Dict[str, str]:
    global _cache
    if not _cache:
        _cache = discover()
    return _cache


def get_model_names() -> List[str]:
    instances = get_instances()
    return list(instances.keys()) if instances else ["(no models found)"]


def get_url(model_name: str) -> str:
    instances = get_instances()
    base_url = os.environ.get("VLLM_API_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")
    return instances.get(model_name, base_url)
