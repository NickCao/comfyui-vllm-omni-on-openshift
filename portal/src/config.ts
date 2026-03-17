function parseAllowedUsers(value: string): string[] {
  if (!value) return [];
  return value.split(",").map((u) => u.trim().toLowerCase()).filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  sessionSecret: process.env.SESSION_SECRET || "change-me-in-production",
  // Comma-separated list of GitHub usernames allowed to use the portal.
  // Must be set — empty list means no users are allowed.
  allowedUsers: parseAllowedUsers(process.env.ALLOWED_GITHUB_USERS || ""),
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
