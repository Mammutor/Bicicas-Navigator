export type LngLat = {
  lng: number
  lat: number
}

export type PlaceKind = 'location' | 'map'

export type Place = LngLat & {
  label: string
  stationId?: string
  kind?: PlaceKind
}

export type Station = LngLat & {
  id: string
  name: string
  number: string | null
  title: string
  bikesAvailable: number
  capacity: number
  docksAvailable: number
  incidents: number
  online: boolean
  lastSeen: string
}

export type TravelMode = 'walk' | 'bike'

export type Maneuver = {
  instruction: string
  lengthKm: number
  timeSec: number
}

export type RouteLeg = {
  mode: TravelMode
  toLabel: string
  coordinates: [number, number][]
  lengthKm: number
  timeSec: number
  maneuvers: Maneuver[]
}

export type TripWarning = {
  code: 'offline' | 'noBikes' | 'noDocks'
  station: string
}

export type Trip = {
  pickup: Station
  dropoff: Station
  legs: RouteLeg[]
  warnings: TripWarning[]
}

export type StationFilter = 'all' | 'bikes' | 'docks'
