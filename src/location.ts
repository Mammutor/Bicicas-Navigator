import { Capacitor } from '@capacitor/core'
import { Geolocation, type PositionOptions } from '@capacitor/geolocation'
import type { LngLat } from './types'

export type PositionFix = LngLat & { approximate: boolean }

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

export async function watchPosition(onMove: (point: LngLat) => void): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    if (!navigator.geolocation) return ''
    const id = navigator.geolocation.watchPosition(
      (position) => onMove({ lng: position.coords.longitude, lat: position.coords.latitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 5000 },
    )
    return String(id)
  }
  return Geolocation.watchPosition(
    { enableHighAccuracy: false, timeout: 20000, maximumAge: 5000 },
    (position) => {
      if (!position) return
      onMove({
        lng: position.coords.longitude,
        lat: position.coords.latitude,
      })
    },
  )
}

export function clearPositionWatch(id: string) {
  if (!id) return
  if (!Capacitor.isNativePlatform()) {
    navigator.geolocation?.clearWatch(Number(id))
    return
  }
  return Geolocation.clearWatch({ id })
}
