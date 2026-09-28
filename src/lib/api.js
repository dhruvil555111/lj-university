const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

export function apiUrl(path) {
    return `${apiBaseUrl}/${path.replace(/^\/+/, "")}`;
}
