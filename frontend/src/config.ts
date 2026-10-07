// Only VITE_ variables belong here: Vite embeds them in the public browser bundle.
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') ?? ''
