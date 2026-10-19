import { distanceMeters, fold } from './geo'
import type { Locale } from './i18n'
import type { LngLat } from './types'

const PHOTON_URL = 'https://photon.komoot.io/api/'
const CASTELLO: LngLat = { lng: -0.0376, lat: 39.9864 }
const AREA = { west: -0.16, south: 39.9, east: 0.1, north: 40.1 }
const SKIPPED_TYPES = new Set(['country', 'state', 'county'])
const CATALAN = /[àèòç·]|l·l|d'|Castelló/i
const ROAD_WORDS = new Set([
  'carrer', 'calle', 'avinguda', 'avenida', 'avda', 'plaza', 'placa', 'passeig', 'paseo',
  'ronda', 'carretera', 'travessia', 'travesia', 'camino', 'del', 'dels', 'les', 'los', 'las',
])

export type AddressHit = {
  id: string
  lng: number
  lat: number
  name?: string
  street?: string
  housenumber?: string
  district?: string
  city?: string
}

type PhotonProperties = {
  osm_type?: string
  osm_id?: number
  type?: string
  name?: string
  street?: string
  housenumber?: string
  district?: string
  city?: string
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: PhotonProperties
}

export async function searchAddresses(
  query: string,
  locale: Locale,
  bias: LngLat | null,
  signal: AbortSignal,
): Promise<AddressHit[]> {
  const wanted = typedNumber(query)
  const settled = await Promise.allSettled([
    fetchPhoton(query, locale, bias, signal, false),
    wanted ? fetchPhoton(query, locale, bias, signal, true) : Promise.resolve([]),
  ])
  if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  const failures = settled.filter((item) => item.status === 'rejected')
  if (failures.length === settled.length) throw failures[0].reason
  const hits = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value : []))
  return rankHits(hits, query, wanted)
}

async function fetchPhoton(
  query: string,
  locale: Locale,
  bias: LngLat | null,
  signal: AbortSignal,
  houses: boolean,
): Promise<AddressHit[]> {
  const focus = bias && insideArea(bias) ? bias : CASTELLO
  const url = new URL(PHOTON_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('lat', String(focus.lat))
  url.searchParams.set('lon', String(focus.lng))
  url.searchParams.set('zoom', houses ? '17' : '13')
  url.searchParams.set('bbox', `${AREA.west},${AREA.south},${AREA.east},${AREA.north}`)
  url.searchParams.set('limit', houses ? '8' : '6')
  url.searchParams.set('lang', locale === 'en' ? 'en' : 'default')
  if (houses) url.searchParams.set('layer', 'house')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(String(response.status))
  const data = (await response.json()) as { features?: PhotonFeature[] }
  const hits: AddressHit[] = []
  for (const feature of data.features ?? []) {
    const hit = toHit(feature)
    if (hit) hits.push(hit)
  }
  return hits
}

function rankHits(hits: AddressHit[], query: string, wanted: string | null): AddressHit[] {
  const unique = new Map<string, AddressHit>()
  for (const hit of hits) {
    const current = unique.get(hit.id)
    if (!current || (!current.housenumber && hit.housenumber)) unique.set(hit.id, hit)
  }
  const scored = [...unique.values()].map((hit) => ({ hit, rank: rankHit(hit, query, wanted) }))
  const buildings = wanted ? scored.filter((item) => item.rank === 0) : []
  const pool = buildings.length > 0 ? buildings : scored.filter((item) => item.rank < 4)
  pool.sort((a, b) => a.rank - b.rank || Number(Boolean(b.hit.name)) - Number(Boolean(a.hit.name)))
  const kept: AddressHit[] = []
  for (const item of pool) {
    const hit = item.hit
    const duplicate = hit.housenumber && kept.some((other) =>
      other.housenumber === hit.housenumber &&
      fold(other.street ?? '') === fold(hit.street ?? '') &&
      distanceMeters(other, hit) < 40,
    )
    if (duplicate) continue
    kept.push(hit)
    if (kept.length === 6) break
  }
  return kept
}

function rankHit(hit: AddressHit, query: string, wanted: string | null): number {
  const number = normalizeNumber(hit.housenumber ?? '')
  const sameNumber = Boolean(wanted && number === wanted)
  const sameStreet = streetMatches(query, hit.street) || (!hit.housenumber && streetMatches(query, hit.name))
  if (sameNumber && sameStreet) return 0
  if (!wanted && sameStreet) return 1
  if (wanted && !number) return 2
  return 4
}

export function formatAddress(hit: AddressHit, locale: Locale): { title: string; detail: string } {
  const street = localPlace(hit.street, locale)
  const name = localPlace(hit.name, locale)
  const numbered = street && hit.housenumber ? `${street} ${hit.housenumber}` : ''
  const place = [localPlace(hit.district, locale), localPlace(hit.city, locale)].filter(Boolean).join(', ')
  if (numbered) {
    const extra = name && fold(name) !== fold(numbered) ? name : ''
    return { title: numbered, detail: [extra, place].filter(Boolean).join(' · ') }
  }
  return { title: street || name, detail: place }
}

function typedNumber(query: string): string | null {
  const match = query.match(/(?:^|\s)(\d{1,4})(?:\s*([a-zA-Z]{1,4}))?(?=\s|$)/)
  if (!match) return null
  return normalizeNumber(`${match[1]}${match[2] ?? ''}`)
}

function normalizeNumber(value: string): string {
  const match = value.replace(/\s+/g, '').toUpperCase().match(/^0*(\d+)([A-Z]*)$/)
  if (!match) return ''
  return `${match[1]}${match[2]}`
}

function streetMatches(query: string, street: string | undefined): boolean {
  if (!street) return false
  const wanted = words(query.replace(/\d+/g, ' '))
  const have = words(street)
  if (wanted.length === 0 || have.length === 0) return false
  return have.every((word) => wanted.includes(word)) || wanted.every((word) => have.includes(word))
}

function words(value: string): string[] {
  return fold(value).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ROAD_WORDS.has(word))
}

function toHit(feature: PhotonFeature): AddressHit | null {
  const properties = feature.properties
  const coordinates = feature.geometry?.coordinates
  if (!properties || !coordinates) return null
  if (properties.type && SKIPPED_TYPES.has(properties.type)) return null
  const [lng, lat] = coordinates
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (!properties.name && !properties.street) return null
  const housenumber = properties.housenumber
  return {
    id: `${properties.osm_type ?? 'x'}:${properties.osm_id ?? `${lng},${lat}`}:${housenumber ?? ''}`,
    lng,
    lat,
    name: properties.name,
    street: properties.street,
    housenumber,
    district: properties.district,
    city: properties.city,
  }
}

function insideArea(point: LngLat): boolean {
  return point.lng >= AREA.west && point.lng <= AREA.east && point.lat >= AREA.south && point.lat <= AREA.north
}

function localPlace(value: string | undefined, locale: Locale): string {
  if (!value) return ''
  const parts = value.split(' / ').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2 || locale === 'en') return parts[0] ?? value
  if (locale === 'va') return parts.find((part) => CATALAN.test(part)) ?? parts[0]
  return parts.find((part) => !CATALAN.test(part)) ?? parts[parts.length - 1]
}
