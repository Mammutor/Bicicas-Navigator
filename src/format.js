export function formatDuration(seconds) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60)
        return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
export function formatDistance(km, locale = 'es') {
    if (km < 1)
        return `${Math.max(1, Math.round(km * 1000))} m`;
    const text = km.toFixed(1);
    return `${locale === 'en' ? text : text.replace('.', ',')} km`;
}
export function formatUpdated(lastSeen, updated, missing) {
    const time = lastSeen.split(' ')[1]?.slice(0, 5);
    return time ? updated.replace('{time}', time) : missing;
}
export function splitStationName(name) {
    const match = name.match(/^(\d+)\.\s*(.*)$/);
    if (!match)
        return { number: null, title: name };
    return { number: match[1], title: match[2] || name };
}
