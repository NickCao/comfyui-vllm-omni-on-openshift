"""
Discover vLLM model instances for ComfyUI.

Queries the endpoint specified by the VLLM_API_BASE_URL environment
variable (typically a LiteLLM Proxy) for available models via its
/v1/models endpoint.

Results are cached with a configurable TTL (default 300 s).  If the
upstream is unreachable the cache returns stale data when available,
and retries on the next call after the TTL expires.
"""

import json
import os
import time
from typing import Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

_DEFAULT_BASE_URL = "http://litellm:4000/v1"
_DEFAULT_CACHE_TTL = 300  # seconds


def _get_api_key() -> Optional[str]:
    return os.environ.get("VLLM_API_KEY")


def _get_cache_ttl() -> float:
    try:
        return float(os.environ.get("VLLM_DISCOVERY_CACHE_TTL", _DEFAULT_CACHE_TTL))
    except ValueError:
        return float(_DEFAULT_CACHE_TTL)


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
        api_key = _get_api_key()
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
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
_cache_time: float = 0.0


def get_instances() -> Dict[str, str]:
    """Return discovered models, refreshing when the TTL has expired."""
    global _cache, _cache_time
    now = time.monotonic()
    if _cache and (now - _cache_time) < _get_cache_ttl():
        return _cache

    result = discover()
    if result:
        _cache = result
        _cache_time = now
    elif not _cache:
        # No cached data and discovery failed — record the attempt time
        # so we don't hammer the endpoint on every call, but retry after
        # the TTL expires.
        _cache_time = now

    return _cache


def get_model_names() -> List[str]:
    instances = get_instances()
    return list(instances.keys()) if instances else ["(no models found)"]


def get_url(model_name: str) -> str:
    instances = get_instances()
    base_url = os.environ.get("VLLM_API_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")
    return instances.get(model_name, base_url)
