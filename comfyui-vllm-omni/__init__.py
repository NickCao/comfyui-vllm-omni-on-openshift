"""
ComfyUI-vLLM-Omni custom node package.

Provides text-to-image generation capabilities using vLLM-Omni's diffusion backend.
On OpenShift, available models are discovered automatically via the K8s API
from KServe InferenceService resources in the namespace.

In ComfyUI, add the "vLLM-Omni Text-to-Image" node from the
"image/generation/vllm-omni" category, select a model from the dropdown,
and connect it to other nodes (e.g., SaveImage).
"""

from .vllm_omni_node import VLLMTextToImage, VLLMImageEdit

# ComfyUI requires these two dictionaries for node registration
NODE_CLASS_MAPPINGS = {
    "VLLMTextToImage": VLLMTextToImage,
    "VLLMImageEdit": VLLMImageEdit,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VLLMTextToImage": "vLLM-Omni Text-to-Image",
    "VLLMImageEdit": "vLLM-Omni Image Edit (EXPERIMENTAL)",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
