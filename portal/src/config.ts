export const config = {
  port: parseInt(process.env.PORT || "3000"),
  sessionSecret: process.env.SESSION_SECRET || "change-me-in-production",
  github: {
    clientID: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/auth/github/callback",
  },
  helm: {
    chartPath: process.env.COMFYUI_CHART_PATH || "../charts/comfyui",
    namespace: process.env.COMFYUI_NAMESPACE || "comfyui-vllm-omni",
    releasePrefix: "comfyui-",
    defaultValues: {
      vllmOmniUrl: process.env.VLLM_OMNI_URL || "",
    },
  },
};
