export async function reverseAddress(point, language) {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const response = await fetch(url, {
        headers: { 'Accept-Language': language },
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
        throw new Error(String(response.status));
    const data = (await response.json());
    const street = data.address?.road || data.address?.pedestrian || data.address?.footway || data.name;
    if (street) {
        return data.address?.house_number ? `${street} ${data.address.house_number}` : street;
    }
    const display = data.display_name?.split(',')[0]?.trim();
    if (display)
        return display;
    throw new Error('empty');
}
