import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import {
  LngLatBounds,
  Map,
  NavigationControl,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { stationFill } from './geo'
import type { LngLat, Place, RouteLeg, Station } from './types'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const CASTELLON: [number, number] = [-0.039, 39.9865]

export type MapHandle = {
  flyTo: (point: LngLat, zoom?: number) => void
}

type MapViewProps = {
  stations: Station[]
  selectedId: string | null
  origin: Place | null
  destination: Place | null
  userLocation: LngLat | null
  legs: RouteLeg[]
  onSelectStation: (id: string) => void
  onHoldPlace: (point: LngLat, stationId: string | null) => void
}

type FeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id?: string
    properties: Record<string, string | number>
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] }
  }>
}

const emptyCollection = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
})

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  {
    stations,
    selectedId,
    origin,
    destination,
    userLocation,
    legs,
    onSelectStation,
    onHoldPlace,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pendingFly = useRef<{ point: LngLat; zoom: number } | null>(null)
  const readyRef = useRef(false)
  const selectedRef = useRef<string | null>(null)
  const handlersRef = useRef({ onSelectStation, onHoldPlace })
  const dataRef = useRef({ stations, selectedId, origin, destination, userLocation, legs })

  handlersRef.current = { onSelectStation, onHoldPlace }
  dataRef.current = { stations, selectedId, origin, destination, userLocation, legs }

  useImperativeHandle(ref, () => ({
    flyTo(point, zoom = 15) {
      const map = mapRef.current
      if (!map) {
        pendingFly.current = { point, zoom }
        return
      }
      pendingFly.current = null
      map.flyTo({
        center: [point.lng, point.lat],
        zoom: Math.max(map.getZoom(), zoom),
        essential: true,
      })
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new Map({
      container,
      style: STYLE_URL,
      center: CASTELLON,
      zoom: 13,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    const queued = pendingFly.current
    if (queued) {
      pendingFly.current = null
      map.flyTo({
        center: [queued.point.lng, queued.point.lat],
        zoom: Math.max(map.getZoom(), queued.zoom),
        essential: true,
      })
    }

    map.on('load', () => {
      readyRef.current = true
      map.addSource('routes', { type: 'geojson', data: emptyCollection() })
      map.addSource('places', { type: 'geojson', data: emptyCollection() })
      map.addSource('user', { type: 'geojson', data: emptyCollection() })
      map.addSource('stations', {
        type: 'geojson',
        data: emptyCollection(),
        promoteId: 'id',
      })

      map.addLayer({
        id: 'route-walk',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'mode'], 'walk'],
        paint: {
          'line-color': '#1F96B0',
          'line-width': 4,
          'line-dasharray': [1.2, 1.4],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'route-bike',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'mode'], 'bike'],
        paint: {
          'line-color': '#63B01F',
          'line-width': 6,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'user-dot',
        type: 'circle',
        source: 'user',
        paint: {
          'circle-radius': 7,
          'circle-color': '#2B2A29',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'place-circles',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-radius': 8,
          'circle-color': ['match', ['get', 'role'], 'origin', '#2B2A29', '#63B01F'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'station-circles',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 18, 14],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            2,
          ],
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'station-labels',
        type: 'symbol',
        source: 'stations',
        layout: {
          'text-field': ['to-string', ['get', 'bikes']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
        },
        paint: { 'text-color': '#ffffff' },
      })

      paintMap(map, dataRef.current, selectedRef)

      let holdTimer = 0
      let lastHold = 0
      const cancelHold = () => window.clearTimeout(holdTimer)
      const stationAt = (point: { x: number; y: number }) => {
        const pad = 18
        const hits = map.queryRenderedFeatures(
          [
            [point.x - pad, point.y - pad],
            [point.x + pad, point.y + pad],
          ],
          { layers: ['station-circles', 'station-labels'] },
        )
        const id = hits[0]?.properties?.id
        return typeof id === 'string' ? id : null
      }
      const emitHold = (lng: number, lat: number, stationId: string | null) => {
        const now = Date.now()
        if (now - lastHold < 700) return
        lastHold = now
        handlersRef.current.onHoldPlace({ lng, lat }, stationId)
      }
      const beginHold = (event: { lngLat: { lng: number; lat: number }; point: { x: number; y: number }; originalEvent: Event }) => {
        const original = event.originalEvent
        if (original instanceof MouseEvent && original.button !== 0) return
        if (typeof TouchEvent !== 'undefined' && original instanceof TouchEvent && original.touches.length > 1) return
        cancelHold()
        const screen = event.point
        const lngLat = event.lngLat
        holdTimer = window.setTimeout(() => emitHold(lngLat.lng, lngLat.lat, stationAt(screen)), 550)
      }

      map.on('mousedown', beginHold)
      map.on('touchstart', beginHold)
      map.on('mouseup', cancelHold)
      map.on('touchend', cancelHold)
      map.on('touchcancel', cancelHold)
      map.on('dragstart', cancelHold)
      map.on('contextmenu', (event) => {
        event.originalEvent.preventDefault()
        cancelHold()
        emitHold(event.lngLat.lng, event.lngLat.lat, stationAt(event.point))
      })

      map.on('click', (event) => {
        const hits = map.queryRenderedFeatures(event.point, {
          layers: ['station-circles', 'station-labels'],
        })
        const stationId = hits[0]?.properties?.id
        if (typeof stationId === 'string') {
          handlersRef.current.onSelectStation(stationId)
        }
      })

      map.on('mouseenter', 'station-circles', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'station-circles', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource('stations') as GeoJSONSource | undefined
    source?.setData(stationsToGeoJSON(stations))
    if (selectedRef.current && selectedRef.current !== selectedId) {
      map.removeFeatureState({ source: 'stations', id: selectedRef.current })
    }
    if (selectedId) {
      map.setFeatureState({ source: 'stations', id: selectedId }, { selected: true })
    }
    selectedRef.current = selectedId
  }, [stations, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource('routes') as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: legs
        .filter((leg) => leg.coordinates.length > 1)
        .map((leg) => ({
          type: 'Feature' as const,
          properties: { mode: leg.mode },
          geometry: { type: 'LineString' as const, coordinates: leg.coordinates },
        })),
    })
    if (legs.length === 0) return
    const bounds = new LngLatBounds()
    for (const leg of legs) {
      for (const coordinate of leg.coordinates) bounds.extend(coordinate)
    }
    if (bounds.isEmpty()) return
    const wide = window.innerWidth >= 860
    map.fitBounds(bounds, {
      padding: wide
        ? { top: 48, bottom: 48, left: 460, right: 48 }
        : { top: 40, bottom: 240, left: 28, right: 28 },
      maxZoom: 16,
      duration: 800,
    })
  }, [legs])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const features: FeatureCollection['features'] = []
    if (origin) {
      features.push(pointFeature('origin', origin, 'Origen'))
    }
    if (destination) {
      features.push(pointFeature('destination', destination, 'Destino'))
    }
    const source = map.getSource('places') as GeoJSONSource | undefined
    source?.setData({ type: 'FeatureCollection', features })
  }, [origin, destination])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource('user') as GeoJSONSource | undefined
    source?.setData(
      userLocation
        ? {
            type: 'FeatureCollection',
            features: [pointFeature('user', userLocation, 'Tú')],
          }
        : emptyCollection(),
    )
  }, [userLocation])

  return <div ref={containerRef} className="map" />
})

function paintMap(
  map: MapLibreMap,
  data: {
    stations: Station[]
    selectedId: string | null
    origin: Place | null
    destination: Place | null
    userLocation: LngLat | null
    legs: RouteLeg[]
  },
  selectedRef: { current: string | null },
) {
  const stationsSource = map.getSource('stations') as GeoJSONSource | undefined
  stationsSource?.setData(stationsToGeoJSON(data.stations))
  if (selectedRef.current && selectedRef.current !== data.selectedId) {
    map.removeFeatureState({ source: 'stations', id: selectedRef.current })
  }
  if (data.selectedId) {
    map.setFeatureState({ source: 'stations', id: data.selectedId }, { selected: true })
  }
  selectedRef.current = data.selectedId

  const routes = map.getSource('routes') as GeoJSONSource | undefined
  routes?.setData({
    type: 'FeatureCollection',
    features: data.legs
      .filter((leg) => leg.coordinates.length > 1)
      .map((leg) => ({
        type: 'Feature' as const,
        properties: { mode: leg.mode },
        geometry: { type: 'LineString' as const, coordinates: leg.coordinates },
      })),
  })

  const places = map.getSource('places') as GeoJSONSource | undefined
  const placeFeatures: FeatureCollection['features'] = []
  if (data.origin) placeFeatures.push(pointFeature('origin', data.origin, 'Origen'))
  if (data.destination) placeFeatures.push(pointFeature('destination', data.destination, 'Destino'))
  places?.setData({ type: 'FeatureCollection', features: placeFeatures })

  const user = map.getSource('user') as GeoJSONSource | undefined
  user?.setData(
    data.userLocation
      ? {
          type: 'FeatureCollection',
          features: [pointFeature('user', data.userLocation, 'Tú')],
        }
      : emptyCollection(),
  )
}

function stationsToGeoJSON(stations: Station[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((station) => ({
      type: 'Feature',
      id: station.id,
      properties: {
        id: station.id,
        bikes: station.bikesAvailable,
        color: stationFill(station),
      },
      geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
    })),
  }
}

function pointFeature(
  role: string,
  point: LngLat,
  label: string,
): FeatureCollection['features'][number] {
  return {
    type: 'Feature',
    properties: { role, label },
    geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
  }
}
