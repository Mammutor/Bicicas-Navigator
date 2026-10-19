import { decodePolyline, distanceMeters, nearestStation } from './geo'
import type { TripErrorCode } from './i18n'
import type { LngLat, Place, RouteLeg, Station, TravelMode, Trip, TripWarning } from './types'

export class TripError extends Error {
  constructor(readonly code: TripErrorCode) {
    super(code)
    this.name = 'TripError'
  }
}

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route'
const CLIENT_ID = 'bicicas-navigator'
const STATION_SNAP_M = 45

type Costing = 'bicycle' | 'pedestrian'

type ValhallaResponse = {
  error?: string
  trip?: {
    legs?: Array<{
      shape?: string
      summary?: { time?: number; length?: number }
      maneuvers?: Array<{
        instruction?: string
        length?: number
        time?: number
      }>
    }>
  }
}

export async function planTrip(
  origin: Place,
  destination: Place,
  stations: Station[],
  language: string,
): Promise<Trip> {
  if (stations.length === 0) {
    throw new TripError('noStations')
  }

  const warnings: TripWarning[] = []
  const originStation = resolveStation(origin, stations)
  const destinationStation = resolveStation(destination, stations)

  if (
    originStation &&
    destinationStation &&
    originStation.id === destinationStation.id
  ) {
    throw new TripError('sameStation')
  }

  const pickup = originStation ?? nearestStation(
    stations,
    origin,
    (station) => station.online && station.bikesAvailable > 0,
  )
  if (!pickup) {
    throw new TripError('noBikes')
  }
  warnAboutStation(pickup, 'bikes', warnings)

  const dropoff = destinationStation ?? nearestStation(
    stations,
    destination,
    (station) =>
      station.online && station.docksAvailable > 0 && station.id !== pickup.id,
  )
  if (!dropoff) {
    throw new TripError('noDocks')
  }
  if (dropoff.id === pickup.id) {
    throw new TripError('samePickup')
  }
  warnAboutStation(dropoff, 'docks', warnings)

  const legs: RouteLeg[] = []
  if (distanceMeters(origin, pickup) > STATION_SNAP_M) {
    legs.push(await fetchLeg(origin, pickup, 'pedestrian', 'walk', pickup.title, language))
  }
  legs.push(await fetchLeg(pickup, dropoff, 'bicycle', 'bike', dropoff.title, language))
  if (distanceMeters(dropoff, destination) > STATION_SNAP_M) {
    legs.push(
      await fetchLeg(dropoff, destination, 'pedestrian', 'walk', destination.label, language),
    )
  }

  return { pickup, dropoff, legs, warnings }
}

function resolveStation(place: Place, stations: Station[]): Station | null {
  if (place.stationId) {
    return stations.find((station) => station.id === place.stationId) ?? null
  }
  const closest = nearestStation(stations, place, () => true)
  if (!closest || distanceMeters(place, closest) > STATION_SNAP_M) return null
  return closest
}

function warnAboutStation(
  station: Station,
  kind: 'bikes' | 'docks',
  warnings: TripWarning[],
) {
  if (!station.online) {
    warnings.push({ code: 'offline', station: station.title })
    return
  }
  if (kind === 'bikes' && station.bikesAvailable <= 0) {
    warnings.push({ code: 'noBikes', station: station.title })
  }
  if (kind === 'docks' && station.docksAvailable <= 0) {
    warnings.push({ code: 'noDocks', station: station.title })
  }
}

async function fetchLeg(
  from: LngLat,
  to: LngLat,
  costing: Costing,
  mode: TravelMode,
  toLabel: string,
  language: string,
): Promise<RouteLeg> {
  const response = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': CLIENT_ID,
    },
    body: JSON.stringify({
      locations: [
        { lon: from.lng, lat: from.lat },
        { lon: to.lng, lat: to.lat },
      ],
      costing,
      costing_options:
        costing === 'bicycle'
          ? {
              bicycle: {
                bicycle_type: 'City',
                cycling_speed: 16,
                // Prefer cycleways and separated lanes. Roads stay available
                // where the bike network does not connect.
                use_roads: 0,
              },
            }
          : { pedestrian: { walking_speed: 5.1 } },
      directions_options: { units: 'kilometers', language },
      shape_format: 'polyline6',
    }),
  })

  const body = (await response.json().catch(() => null)) as ValhallaResponse | null
  if (!response.ok || !body?.trip?.legs?.[0]?.shape) {
    throw new TripError('legFailed')
  }

  const leg = body.trip.legs[0]
  return {
    mode,
    toLabel,
    coordinates: decodePolyline(leg.shape ?? ''),
    lengthKm: leg.summary?.length ?? 0,
    timeSec: leg.summary?.time ?? 0,
    maneuvers: (leg.maneuvers ?? [])
      .map((maneuver) => ({
        instruction: maneuver.instruction?.trim() ?? '',
        lengthKm: maneuver.length ?? 0,
        timeSec: maneuver.time ?? 0,
      }))
      .filter((maneuver) => maneuver.instruction.length > 0),
  }
}
