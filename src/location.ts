import { Capacitor } from '@capacitor/core'
import { Geolocation, type PositionOptions } from '@capacitor/geolocation'
import { distanceMeters } from './geo'
import type { LngLat } from './types'

export type PositionFix = LngLat & { approximate: boolean }

export type LiveFix = LngLat & {
  /** Degrees clockwise from north, or null when the device has no direction. */
  heading: number | null
  /** True when this fix is movement along the road, not a stationary jitter. */
  moving: boolean
}

type DeviceCoords = {
  longitude: number
  latitude: number
  speed?: number | null
  heading?: number | null
  course?: number | null
  trueHeading?: number | null
}

const WATCH: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
  // Android otherwise waits on the timeout (many seconds) between fixes.
  interval: 1000,
  minimumUpdateInterval: 1000,
}

const IP_URLS = ['https://ipapi.co/json/', 'https://get.geojs.io/v1/ip/geo.json']

function denied(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 1
}

function devicePosition(options: PositionOptions): Promise<LngLat> {
  if (Capacitor.isNativePlatform()) {
    return Geolocation.getCurrentPosition(options).then((position) => ({
      lng: position.coords.longitude,
      lat: position.coords.latitude,
    }))
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lng: position.coords.longitude, lat: position.coords.latitude }),
      reject,
      options,
    )
  })
}

async function networkPosition(): Promise<LngLat> {
  let lastError: unknown
  for (const url of IP_URLS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error(String(response.status))
      const data = (await response.json()) as { latitude?: unknown; longitude?: unknown }
      const lat = Number(data.latitude)
      const lng = Number(data.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('invalid')
      return { lat, lng }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('network')
}

export async function readPosition(): Promise<PositionFix> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Geolocation.requestPermissions()
    } catch {
      // A disabled location service rejects here. The position calls below still run.
    }
  }
  try {
    const point = await devicePosition({ enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 })
    return { ...point, approximate: false }
  } catch (error) {
    if (!denied(error)) {
      try {
        const point = await devicePosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
        return { ...point, approximate: false }
      } catch (preciseError) {
        if (denied(preciseError)) throw preciseError
      }
    }
  }
  // Chromium on Linux reports permission as granted, then fails because its
  // network location service is unavailable. A network lookup still places the start.
  const point = await networkPosition()
  return { ...point, approximate: true }
}

export async function watchPosition(onMove: (fix: LiveFix) => void): Promise<string> {
  const emit = trackFixes(onMove)
  if (!Capacitor.isNativePlatform()) {
    if (!navigator.geolocation) return ''
    const id = navigator.geolocation.watchPosition(
      (position) => emit(position.coords),
      () => {},
      WATCH,
    )
    return String(id)
  }
  return Geolocation.watchPosition(WATCH, (position) => {
    if (!position) return
    emit(position.coords)
  })
}

export function stillFix(point: LngLat): LiveFix {
  return { lng: point.lng, lat: point.lat, heading: null, moving: false }
}

function finiteHeading(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value % 360
}

function angleBetween(a: number, b: number) {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

function trackFixes(onMove: (fix: LiveFix) => void) {
  let last: LiveFix | null = null
  return (coords: DeviceCoords) => {
    if (!Number.isFinite(coords.longitude) || !Number.isFinite(coords.latitude)) return
    const point = { lng: coords.longitude, lat: coords.latitude }
    const step = last ? distanceMeters(last, point) : Infinity
    const speed = typeof coords.speed === 'number' && coords.speed >= 0 ? coords.speed : null
    const moving = speed != null ? speed >= 1.2 : last != null && step >= 3
    const travel = finiteHeading(coords.course) ?? (moving ? finiteHeading(coords.heading) : null)
    const compass = finiteHeading(coords.trueHeading) ?? finiteHeading(coords.heading)
    const heading = moving && travel != null ? travel : compass
    const turned =
      heading != null && (last?.heading == null || angleBetween(last.heading, heading) >= 25)
    if (last && step < 3 && !turned) return
    last = { ...point, heading, moving }
    onMove(last)
  }
}

export function clearPositionWatch(id: string) {
  if (!id) return
  if (!Capacitor.isNativePlatform()) {
    navigator.geolocation?.clearWatch(Number(id))
    return
  }
  return Geolocation.clearWatch({ id })
}
