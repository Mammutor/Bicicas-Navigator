const STORAGE_KEY = 'bicicas-favorites';
function isFavorite(value) {
    if (!value || typeof value !== 'object')
        return false;
    const item = value;
    return (typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.lng === 'number' &&
        typeof item.lat === 'number' &&
        (item.stationId === undefined || typeof item.stationId === 'string'));
}
export function readFavorites() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter(isFavorite);
    }
    catch {
        return [];
    }
}
export function writeFavorites(items) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
    catch {
        // Private browsing can block storage. The list still works for this visit.
    }
}
