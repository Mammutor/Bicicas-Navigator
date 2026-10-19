import { fold } from './geo'
import type { Locale } from './i18n'
import type { AddressHit } from './photon'

const CANDIDATES_URL = 'https://www.cartociudad.es/geocoder/api/geocoder/candidates'
const CITY_CODE = '12040'
const CITY_QUERY = 'Castellón de la Plana'

/** Abbreviations and Valencian road words, keyed by the folded token. */
const WORD_MAP: Record<string, string> = {
  avinguda: 'avenida',
  avda: 'avenida',
  avd: 'avenida',
  av: 'avenida',
  carrer: 'calle',
  placa: 'plaza',
  pl: 'plaza',
  pza: 'plaza',
  passeig: 'paseo',
  pg: 'paseo',
  ctra: 'carretera',
  travessia: 'travesia',
  cami: 'camino',
  major: 'mayor',
  dra: 'doctora',
  dr: 'doctor',
  sta: 'santa',
  sto: 'santo',
}

const CARTO_WORD: Record<string, string> = {
  avinguda: 'Avenida',
  avda: 'Avenida',
  avd: 'Avenida',
  av: 'Avenida',
  carrer: 'Calle',
  placa: 'Plaza',
  pl: 'Plaza',
  pza: 'Plaza',
  passeig: 'Paseo',
  pg: 'Paseo',
  ctra: 'Carretera',
  travessia: 'Travesia',
  cami: 'Camino',
  major: 'Mayor',
  dra: 'Doctora',
  dr: 'Doctor',
  sta: 'Santa',
  sto: 'Santo',
}

const LOCALITY = new Set(['castello', 'castellon', 'valencia', 'espana', 'spain', 'comunitat', 'comunidad'])

const ROAD_WORDS = new Set([
  'carrer', 'calle', 'avinguda', 'avenida', 'avda', 'avd', 'av', 'plaza', 'placa', 'pl', 'pza',
  'passeig', 'paseo', 'pg', 'ronda', 'carretera', 'ctra', 'travessia', 'travesia', 'camino', 'cami',
  'glorieta', 'rambla', 'pasaje', 'passatge', 'del', 'dels', 'les', 'los', 'las', 'els',
])

const VIA: Record<string, Record<Locale, string>> = {
  avenida: { es: 'Avenida', va: 'Avinguda', en: 'Avenida' },
  calle: { es: 'Calle', va: 'Carrer', en: 'Calle' },
  plaza: { es: 'Plaza', va: 'Plaça', en: 'Plaza' },
  paseo: { es: 'Paseo', va: 'Passeig', en: 'Paseo' },
  ronda: { es: 'Ronda', va: 'Ronda', en: 'Ronda' },
  carretera: { es: 'Carretera', va: 'Carretera', en: 'Carretera' },
  camino: { es: 'Camino', va: 'Camí', en: 'Camino' },
  travesia: { es: 'Travesía', va: 'Travessia', en: 'Travesía' },
  glorieta: { es: 'Glorieta', va: 'Glorieta', en: 'Glorieta' },
  rambla: { es: 'Rambla', va: 'Rambla', en: 'Rambla' },
  pasaje: { es: 'Pasaje', va: 'Passatge', en: 'Pasaje' },
  callejon: { es: 'Callejón', va: 'Carreró', en: 'Callejón' },
}

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'les', 'els', 'i', 'y', 'd'])

type CartoPlace = {
  id?: string
  type?: string
  address?: string
  muni?: string
  muniCode?: string
  tip_via?: string
  lat?: number
  lng?: number
  portalNumber?: number | null
  extension?: string | null
  postalCode?: string | null
  poblacion?: string | null
  noNumber?: boolean | null
}

export function sameStreetName(query: string, street: string, loose = false): boolean {
  const wanted = distinctive(addressTokens(query))
  const have = distinctive(addressTokens(street))
  if (wanted.length === 0 || have.length === 0) return false
  if (have.every((word) => wanted.includes(word))) return true
  return loose && wanted.every((word) => have.includes(word))
}

function distinctive(tokens: string[]): string[] {
  const kept = tokens.filter((word) => !LOCALITY.has(word))
  return kept.length > 0 ? kept : tokens
}

export function addressTokens(value: string): string[] {
  const stripped = fold(value)
    .replace(/\b\d{5}\b/g, ' ')
    .replace(/\b(castello|castellon) de la plana\b/g, ' ')
  return stripped
    .split(/[^a-z0-9]+/)
    .map((word) => WORD_MAP[word] ?? word)
    .filter((word) => word.length > 2 && !ROAD_WORDS.has(word) && !/^\d+$/.test(word))
}

/** Turn a pasted or abbreviated address into a CartoCiudad query for Castelló. */
export function toCartoQuery(raw: string): string | null {
  let text = raw.replace(/\bc\s*\//gi, 'Calle ')
  text = text.replace(/\b[Cc]\.(?=\s)/g, 'Calle ')
  text = text.replace(/[,;|]+/g, ' ')
  text = text.replace(/\b\d{5}\b/g, ' ')
  text = text.replace(/\b(?:n[ºo°]|n[uú]m(?:ero)?)\.?\s*(?=\d)/gi, ' ')
  const words = text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => CARTO_WORD[fold(word)] ?? word)
  const query = withCity(words.join(' '))
  if (addressTokens(query).length === 0) return null
  return query
}

export async function searchPortals(
  query: string,
  locale: Locale,
  signal: AbortSignal,
): Promise<AddressHit[]> {
  const cartoQuery = toCartoQuery(query)
  if (!cartoQuery) return []
  const places = await fetchCandidates(cartoQuery, signal)
  const hits: AddressHit[] = []
  for (const place of places) {
    const hit = toHit(place, locale)
    if (hit) hits.push(hit)
  }
  return hits
}

async function fetchCandidates(query: string, signal: AbortSignal): Promise<CartoPlace[]> {
  const url = new URL(CANDIDATES_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(String(response.status))
  const data = (await response.json()) as CartoPlace[]
  return Array.isArray(data) ? data : []
}

function toHit(place: CartoPlace, locale: Locale): AddressHit | null {
  if (String(place.muniCode ?? '') !== CITY_CODE) return null
  const lat = place.lat
  const lng = place.lng
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  if (place.noNumber || place.portalNumber == null) return null
  const street = localizedStreet(place, locale)
  if (!street) return null
  const extension = (place.extension ?? '').trim()
  const housenumber = extension ? `${place.portalNumber} ${extension}` : String(place.portalNumber)
  const city = cityLabel(place.muni ?? '', locale)
  const postal = (place.postalCode ?? '').split(/\s+/)[0] ?? ''
  const neighborhood = titleCase(place.poblacion ?? '')
  const district = isCityName(neighborhood) ? postal : [postal, neighborhood].filter(Boolean).join(' · ')
  return {
    id: `carto:${place.id ?? `${lng},${lat}`}:${housenumber}`,
    lng,
    lat,
    street,
    housenumber,
    district,
    city,
  }
}

function localizedStreet(place: CartoPlace, locale: Locale): string {
  const viaKey = fold(place.tip_via ?? '').replace(/[^a-z]/g, '')
  const via = VIA[viaKey]?.[locale] ?? titleCase(place.tip_via ?? '')
  let name = (place.address ?? '').split(/[,(]/)[0] ?? ''
  if (place.tip_via) {
    name = name.replace(new RegExp(`^${escapeRegExp(place.tip_via)}\\s+`, 'i'), '')
  }
  if (place.portalNumber != null) {
    const extension = (place.extension ?? '').trim()
    const ext = extension ? `(?:\\s+${escapeRegExp(extension)})?` : ''
    name = name.replace(new RegExp(`\\s+${place.portalNumber}${ext}\\s*$`, 'i'), '')
  }
  name = titleCase(name.trim())
  if (!name) return via
  return via ? `${via} ${name}` : name
}

function cityLabel(muni: string, locale: Locale): string {
  const folded = fold(muni)
  if (/\bcastello/.test(folded) && /\bplana\b/.test(folded)) {
    return locale === 'va' ? 'Castelló de la Plana' : 'Castellón de la Plana'
  }
  const parts = muni.split('/').map((part) => part.trim()).filter(Boolean)
  if (locale === 'va') return parts.find((part) => /[àèòç]/.test(part)) ?? parts[0] ?? ''
  return parts.find((part) => !/[àèòç]/.test(part)) ?? parts[parts.length - 1] ?? ''
}

function withCity(query: string): string {
  const folded = fold(query)
  if (/\b(castello|castellon) de la plana\b/.test(folded)) {
    return query.replace(/\s+(castell[oó]|castellon)\s*$/i, '').replace(/\s+/g, ' ').trim()
  }
  const bare = query.match(/^(.*\S)\s+(castell[oó]|castellon)\s*$/i)
  if (bare?.[1]) return `${bare[1]} ${CITY_QUERY}`
  return `${query} ${CITY_QUERY}`.trim()
}

function isCityName(value: string): boolean {
  const folded = fold(value)
  return /\bcastello/.test(folded) && /\bplana\b/.test(folded)
}

function titleCase(value: string): string {
  let wordIndex = 0
  return value
    .toLocaleLowerCase('es')
    .split(/(\s+|-|')/)
    .map((part) => {
      if (!part || /^[\s'-]+$/.test(part)) return part
      const small = SMALL_WORDS.has(part) && wordIndex > 0
      wordIndex += 1
      if (small) return part
      return part.charAt(0).toLocaleUpperCase('es') + part.slice(1)
    })
    .join('')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
