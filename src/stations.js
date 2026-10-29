import { splitStationName } from './format';
/** Feed loaded by the public map at https://www.bicicas.es/mapa */
export const STATIONS_URL = 'https://gateway.bicicas.es/api/bench_status_map';
export async function fetchStations() {
    const response = await fetch(STATIONS_URL);
    if (!response.ok) {
        throw new Error(String(response.status));
    }
    const body = (await response.json());
    return parseStations(body);
}
export function parseStations(body) {
    const features = body.features ?? [];
    const stations = [];
    for (const feature of features) {
        const coordinates = feature.geometry?.coordinates;
        const properties = feature.properties;
        if (!coordinates || coordinates.length < 2 || !properties?.name)
            continue;
        const bikesAvailable = Math.max(0, Number(properties.bikes_available) || 0);
        const capacity = properties.anchors?.length ?? 0;
        const incidents = Math.max(0, Number(properties.incidents) || 0);
        const { number, title } = splitStationName(properties.name);
        stations.push({
            id: properties.name,
            name: properties.name,
            number,
            title,
            lng: coordinates[0],
            lat: coordinates[1],
            bikesAvailable,
            capacity,
            docksAvailable: Math.max(0, capacity - bikesAvailable - incidents),
            incidents,
            online: Boolean(properties.online),
            lastSeen: properties.last_seen ?? '',
        });
    }
    return stations.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
