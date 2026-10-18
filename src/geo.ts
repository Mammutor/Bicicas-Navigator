import type { LngLat, Station } from './types'

const EARTH_RADIUS_M = 6_371_000

export function distanceMeters(a: LngLat, b: LngLat): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function nearestStation(
  stations: Station[],
  point: LngLat,
  accept: (station: Station) => boolean,
): Station | null {
  let best: Station | null = null
  let bestDistance = Infinity
  for (const station of stations) {
    if (!accept(station)) continue
    const distance = distanceMeters(point, station)
    if (distance < bestDistance) {
      best = station
      bestDistance = distance
    }
  }
  return best
}

/** Valhalla's default shape encoding, precision 6. Coordinates are [lng, lat]. */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const coordinates: [number, number][] = []
  const factor = 10 ** precision
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    coordinates.push([lng / factor, lat / factor])
  }

  return coordinates
}

export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function stationFill(station: Station): string {
  if (!station.online) return '#B5B5B5'
  if (station.bikesAvailable <= 0) return '#C44747'
  const ratio = station.capacity > 0 ? station.bikesAvailable / station.capacity : 0
  if (ratio <= 0.25) return '#D9814F'
  if (ratio <= 0.5) return '#C6A227'
  return '#63B01F'
}
