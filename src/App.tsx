import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { reverseAddress } from './address'
import { MapView, type MapHandle } from './MapView'
import { readFavorites, writeFavorites, type Favorite } from './favorites'
import { formatDistance, formatDuration, formatUpdated } from './format'
import { distanceMeters, dockBorder, fold, stationFill } from './geo'
import { fill, useLocale, valhallaLanguage, type Messages } from './i18n'
import { clearPositionWatch, readPosition, stillFix, watchPosition, type LiveFix } from './location'
import { formatAddress, searchAddresses, type AddressHit } from './photon'
import { planTrip, TripError } from './routing'
import { fetchStations } from './stations'
import type { LngLat, Place, Station, StationFilter, Trip, TripWarning } from './types'

type SheetLevel = 'peek' | 'mid' | 'full'

export default function App() {
  const mapRef = useRef<MapHandle>(null)
  const routeToken = useRef(0)
  const sheetRef = useRef<HTMLElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const originRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const holdToken = useRef(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const drag = useRef({
    startY: 0,
    origin: 0,
    moved: false,
    active: false,
    lastY: 0,
    suppressClick: false,
    mode: 'undecided' as 'undecided' | 'sheet' | 'scroll',
    pointerId: -1,
    inBody: false,
  })
  const [stations, setStations] = useState<Station[]>([])
  const { locale, setLocale, t } = useLocale()
  const [stationsError, setStationsError] = useState<'load' | 'refresh' | null>(null)
  const [loadingStations, setLoadingStations] = useState(true)
  const [query, setQuery] = useState('')
  const [addresses, setAddresses] = useState<AddressHit[]>([])
  const [searchingAddresses, setSearchingAddresses] = useState(false)
  const [addressQuery, setAddressQuery] = useState('')
  const biasRef = useRef<LngLat | null>(null)
  const [filter, setFilter] = useState<StationFilter>('all')
  const [selection, setSelection] = useState<Place | null>(null)
  const [departure, setDeparture] = useState<Place | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>(readFavorites)
  const [draftName, setDraftName] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [userLocation, setUserLocation] = useState<LiveFix | null>(null)
  const [following, setFollowing] = useState(false)
  const [followToken, setFollowToken] = useState(0)
  const ride = useRef({
    pausedFollow: false,
    following: false,
    overviewUntil: 0,
    movingStreak: 0,
    seenPrecise: false,
    trip: null as Trip | null,
    origin: null as Place | null,
    departure: null as Place | null,
  })
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<'missing' | 'failed' | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [level, setLevel] = useState<SheetLevel>('peek')
  const [showBikeLanes, setShowBikeLanes] = useState(false)
  const [editing, setEditing] = useState<'origin' | 'destination' | null>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const [peek, setPeek] = useState(180)
  const [mid, setMid] = useState(180)
  const [dragY, setDragY] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const next = await fetchStations()
        if (!active) return
        setStations(next)
        setStationsError(null)
      } catch {
        if (!active) return
        setStationsError('load')
      } finally {
        if (active) setLoadingStations(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 45_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  ride.current.following = following
  ride.current.trip = trip
  ride.current.origin = origin
  ride.current.departure = departure

  useEffect(() => {
    let active = true
    let watchId = ''
    async function start() {
      setLocating(true)
      try {
        const point = await readPosition()
        if (!active) return
        setUserLocation(stillFix(point))
        setOrigin((current) => current ?? { lng: point.lng, lat: point.lat, label: '', kind: 'location' })
        setLocationNote(null)
        if (point.approximate) {
          mapRef.current?.flyTo(point, 13)
        } else if (!ride.current.pausedFollow) {
          ride.current.seenPrecise = true
          ride.current.following = true
          setFollowToken((token) => token + 1)
          setFollowing(true)
        }
        watchId = await watchPosition((next) => {
          if (!active) return
          setUserLocation(next)
          const motion = ride.current
          motion.movingStreak = next.moving
            ? motion.movingStreak + 1
            : Math.max(0, motion.movingStreak - 1)
          if (
            !motion.trip &&
            motion.origin?.kind === 'location' &&
            (!motion.departure || motion.departure.kind === 'location')
          ) {
            setOrigin((current) =>
              current?.kind === 'location' ? { ...current, lng: next.lng, lat: next.lat } : current,
            )
            if (motion.departure?.kind === 'location') {
              setDeparture((current) =>
                current?.kind === 'location' ? { ...current, lng: next.lng, lat: next.lat } : current,
              )
            }
          }
          const firstPrecise = !motion.seenPrecise
          motion.seenPrecise = true
          if (motion.pausedFollow || Date.now() < motion.overviewUntil) return
          if (motion.following) return
          if (firstPrecise || motion.movingStreak >= 2) {
            motion.following = true
            setFollowToken((token) => token + 1)
            setFollowing(true)
          }
        })
        if (!active && watchId) await clearPositionWatch(watchId)
      } catch {
        if (active) setLocationNote('missing')
      } finally {
        if (active) setLocating(false)
      }
    }
    void start()
    return () => {
      active = false
      if (watchId) void clearPositionWatch(watchId)
    }
  }, [])

  useLayoutEffect(() => {
    const peekEl = peekRef.current
    const midEl = midRef.current
    const sheetEl = sheetRef.current
    if (!peekEl || !midEl) return
    const measure = () => {
      const limit = sheetEl?.offsetHeight || peekEl.offsetHeight
      const nextPeek = Math.min(peekEl.offsetHeight, limit)
      const nextMid = Math.min(midEl.offsetHeight, limit)
      setPeek((current) => (current === nextPeek ? current : nextPeek))
      setMid((current) => (current === nextMid ? current : nextMid))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(peekEl)
    observer.observe(midEl)
    if (sheetEl) observer.observe(sheetEl)
    return () => observer.disconnect()
  }, [selection, editing, departure, locale, lookingUp, locationNote, routeError])

  useEffect(() => {
    writeFavorites(favorites)
  }, [favorites])

  biasRef.current = userLocation

  const addressSearch =
    editing !== null &&
    query.trim().length >= 2 &&
    !(editing === 'destination' && selection?.label === query.trim())

  useEffect(() => {
    const text = query.trim()
    if (!addressSearch) {
      setAddresses([])
      setSearchingAddresses(false)
      setAddressQuery('')
      return
    }
    const controller = new AbortController()
    setSearchingAddresses(true)
    const timer = window.setTimeout(() => {
      void searchAddresses(text, locale, biasRef.current, controller.signal)
        .then((hits) => {
          if (controller.signal.aborted) return
          setAddresses(hits)
          setAddressQuery(text)
          setSearchingAddresses(false)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setAddresses([])
          setAddressQuery(text)
          setSearchingAddresses(false)
        })
    }, 350)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [addressSearch, query, locale])

  const selectedId = selection?.stationId ?? null

  const visibleStations = useMemo(
    () =>
      stations.filter(
        (station) => station.id === selectedId || matchesFilter(station, filter),
      ),
    [stations, filter, selectedId],
  )

  const listed = useMemo(() => {
    const folded = fold(query.trim())
    const pool = folded
      ? stations.filter((station) =>
          fold(`${station.number ?? ''} ${station.title} ${station.name}`).includes(folded),
        )
      : stations.filter((station) => matchesFilter(station, filter))
    return [...pool]
      .sort((a, b) => {
        if (!userLocation) return a.title.localeCompare(b.title, 'es')
        return distanceMeters(userLocation, a) - distanceMeters(userLocation, b)
      })
      .slice(0, folded ? 12 : 20)
  }, [query, stations, filter, userLocation])

  const selected = stations.find((station) => station.id === selectedId) ?? null
  const savedFavorite = selection ? matchFavorite(favorites, selection) : undefined

  const matchedFavorites = useMemo(() => {
    const folded = fold(query.trim())
    const pool = folded
      ? favorites.filter((favorite) => fold(favorite.name).includes(folded))
      : favorites
    return [...pool].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [favorites, query])

  function placeFromStation(station: Station): Place {
    return {
      lng: station.lng,
      lat: station.lat,
      label: station.title,
      stationId: station.id,
    }
  }

  function pauseFollow() {
    ride.current.pausedFollow = true
    ride.current.following = false
    setFollowing(false)
  }

  function choosePlace(place: Place, role: 'origin' | 'destination' = 'destination') {
    pauseFollow()
    setQuery('')
    setEditing(null)
    setTrip(null)
    setRouteError(null)
    mapRef.current?.flyTo(place, 16)
    if (role === 'origin') {
      setDeparture(place)
      setOrigin(place)
      originRef.current?.blur()
      if (!selection) {
        setEditing('destination')
        setLevel('full')
        requestAnimationFrame(() => searchRef.current?.focus())
      } else {
        setLevel('mid')
      }
      return
    }
    setSelection(place)
    setDestination(place)
    setDraftName(matchFavorite(favorites, place)?.name ?? place.label)
    setLevel('mid')
    searchRef.current?.blur()
  }

  function chooseStation(station: Station) {
    choosePlace(placeFromStation(station), editingRef.current === 'origin' ? 'origin' : 'destination')
  }

  async function chooseHere() {
    const role = editingRef.current === 'origin' ? 'origin' : 'destination'
    let point: LngLat | null = userLocation
    if (!point) {
      setLocating(true)
      try {
        point = await readPosition()
        setUserLocation(stillFix(point))
        setLocationNote(null)
      } catch {
        setLocationNote('failed')
        setLevel('full')
        return
      } finally {
        setLocating(false)
      }
    }
    choosePlace({ lng: point.lng, lat: point.lat, label: t.yourLocation, kind: 'location' }, role)
  }

  function selectStation(id: string) {
    const station = stations.find((item) => item.id === id)
    if (station) chooseStation(station)
  }

  async function holdOnMap(point: LngLat, stationId: string | null) {
    pauseFollow()
    const role = editingRef.current === 'origin' ? 'origin' : 'destination'
    if (stationId) {
      const station = stations.find((item) => item.id === stationId)
      if (station) {
        choosePlace(placeFromStation(station), role)
        return
      }
    }
    const token = ++holdToken.current
    const blank = { ...point, label: '' }
    if (role === 'origin') {
      setDeparture(blank)
      setOrigin(blank)
      setQuery('')
      setEditing(null)
      setLevel(selection ? 'mid' : 'peek')
    } else {
      choosePlace(blank, 'destination')
    }
    setLookingUp(true)
    try {
      const address = await reverseAddress(point, valhallaLanguage(locale))
      if (token !== holdToken.current) return
      const place: Place = { ...point, label: address }
      if (role === 'origin') {
        setDeparture(place)
        setOrigin(place)
      } else {
        setSelection(place)
        setDestination(place)
        setDraftName(matchFavorite(favorites, place)?.name ?? address)
      }
    } catch {
      if (token !== holdToken.current) return
      const place = { ...point, label: t.mapPoint }
      if (role === 'origin') {
        setDeparture(place)
        setOrigin(place)
      } else {
        setSelection(place)
        setDraftName('')
      }
    } finally {
      if (token === holdToken.current) setLookingUp(false)
    }
  }

  function leaveFromHere() {
    if (!selection) return
    setDeparture(selection)
    setOrigin(selection)
    setSelection(null)
    setDestination(null)
    setTrip(null)
    setRouteError(null)
    setQuery('')
    setEditing('destination')
    setLevel('full')
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function saveFavorite() {
    if (!selection) return
    const name = draftName.trim()
    if (!name) return
    const existing = matchFavorite(favorites, selection)
    if (existing) {
      setFavorites(
        favorites.map((favorite) =>
          favorite.id === existing.id
            ? { ...favorite, name, lng: selection.lng, lat: selection.lat, stationId: selection.stationId }
            : favorite,
        ),
      )
    } else {
      setFavorites([
        ...favorites,
        {
          id: crypto.randomUUID(),
          name,
          lng: selection.lng,
          lat: selection.lat,
          stationId: selection.stationId,
        },
      ])
    }
    setSelection({ ...selection, label: name })
    setDestination({ ...selection, label: name })
  }

  function removeFavorite(id: string) {
    setFavorites(favorites.filter((favorite) => favorite.id !== id))
  }

  function placeLabel(place: Place | null, empty: string) {
    if (!place) return empty
    if (place.kind === 'location') return place.label || t.yourLocation
    if (place.kind === 'map') return t.mapPoint
    return place.label
  }

  function spoken(place: Place): Place {
    return { ...place, label: placeLabel(place, place.label) }
  }

  async function calculate(from: Place, to: Place) {
    const token = ++routeToken.current
    setRouting(true)
    setRouteError(null)
    try {
      const next = await planTrip(spoken(from), spoken(to), stations, valhallaLanguage(locale))
      if (token !== routeToken.current) return
      ride.current.overviewUntil = Date.now() + 5000
      ride.current.movingStreak = 0
      ride.current.following = false
      ride.current.pausedFollow = false
      ride.current.trip = next
      setFollowing(false)
      setTrip(next)
      setLevel('full')
    } catch (error) {
      if (token !== routeToken.current) return
      setTrip(null)
      setRouteError(error instanceof TripError ? t[error.code] : t.routeError)
    } finally {
      if (token === routeToken.current) setRouting(false)
    }
  }

  const calculateRef = useRef(calculate)
  calculateRef.current = calculate
  const planRef = useRef({ origin, destination })
  planRef.current = { origin, destination }

  useEffect(() => {
    const { origin: from, destination: to } = planRef.current
    if (!from || !to) return
    void calculateRef.current(from, to)
  }, [locale])

  async function startTrip() {
    if (!selection || routing) return
    setRouteError(null)
    let from = departure
    if (!from) {
      let point: LngLat | null = userLocation
      if (!point) {
        setRouting(true)
        setLocating(true)
        try {
          point = await readPosition()
          setUserLocation(stillFix(point))
          setLocationNote(null)
        } catch {
          setLocationNote('failed')
          setRouting(false)
          return
        } finally {
          setLocating(false)
        }
      }
      from = { lng: point.lng, lat: point.lat, label: '', kind: 'location' }
    }
    setOrigin(from)
    setDestination(selection)
    await calculate(from, selection)
  }

  async function goToMyLocation() {
    ride.current.pausedFollow = false
    ride.current.overviewUntil = 0
    ride.current.following = true
    setFollowToken((token) => token + 1)
    setFollowing(true)
    setLocating(true)
    try {
      const point = await readPosition()
      setUserLocation((current) => ({
        lng: point.lng,
        lat: point.lat,
        heading: current?.heading ?? null,
        moving: current?.moving ?? false,
      }))
      setOrigin({ lng: point.lng, lat: point.lat, label: '', kind: 'location' })
      setLocationNote(null)
    } catch {
      setLocationNote('failed')
      setLevel('full')
    } finally {
      setLocating(false)
    }
  }

  function originText() {
    if (departure) return placeLabel(departure, t.yourLocation)
    if (userLocation) return t.yourLocation
    return ''
  }

  function swapEnds() {
    const start = departure
    const end = selection
    setTrip(null)
    setRouteError(null)
    setQuery('')
    setEditing(null)
    if (end && start) {
      setDeparture(end)
      setOrigin(end)
      setSelection(start)
      setDestination(start)
      setDraftName(matchFavorite(favorites, start)?.name ?? start.label)
      setLevel('mid')
      return
    }
    if (end) {
      setDeparture(end)
      setOrigin(end)
      setSelection(null)
      setDestination(null)
      setEditing('destination')
      setLevel('full')
      requestAnimationFrame(() => searchRef.current?.focus())
      return
    }
    if (start) {
      setSelection(start)
      setDestination(start)
      setDraftName(matchFavorite(favorites, start)?.name ?? start.label)
      setDeparture(null)
      setOrigin(userLocation ? { ...userLocation, label: '', kind: 'location' } : null)
      setLevel('mid')
    }
  }

  function sheetOffset(which: SheetLevel) {
    const height = sheetRef.current?.offsetHeight ?? 0
    if (which === 'full') return 0
    const shown = which === 'mid' ? mid : peek
    return Math.max(0, height - shown)
  }

  function snapPoints() {
    const points: { level: SheetLevel; y: number }[] = [
      { level: 'full', y: 0 },
      { level: 'peek', y: sheetOffset('peek') },
    ]
    const midY = sheetOffset('mid')
    if (selection && midY < points[1].y - 24) points.splice(1, 0, { level: 'mid', y: midY })
    return points
  }

  function onSheetDown(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current
    gesture.startY = event.clientY
    gesture.origin = dragY ?? sheetOffset(level)
    gesture.moved = false
    gesture.active = true
    gesture.lastY = event.clientY
    gesture.mode = 'undecided'
    gesture.pointerId = event.pointerId
    gesture.inBody = !!bodyRef.current?.contains(event.target as Node)
  }

  function onSheetMove(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current
    if (!gesture.active || event.pointerId !== gesture.pointerId) return
    const delta = event.clientY - gesture.startY
    const step = event.clientY - gesture.lastY
    gesture.lastY = event.clientY
    const body = bodyRef.current
    if (gesture.mode === 'undecided') {
      if (Math.abs(delta) < 8) return
      const overflowing = !!body && body.scrollHeight > body.clientHeight + 1
      const atTop = !body || body.scrollTop <= 0
      gesture.mode =
        level === 'full' && overflowing && gesture.inBody && (delta < 0 || !atTop) ? 'scroll' : 'sheet'
      gesture.moved = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Pointer moves still bubble from the element that received the touch.
      }
      if (gesture.mode === 'sheet') {
        const focused = document.activeElement
        if (focused instanceof HTMLElement && sheetRef.current?.contains(focused)) focused.blur()
      } else if (body) {
        body.scrollTop -= delta
        return
      }
    }

    if (gesture.mode === 'scroll' && body) {
      body.scrollTop -= step
      if (body.scrollTop <= 0 && step > 0) {
        body.scrollTop = 0
        gesture.mode = 'sheet'
        gesture.startY = event.clientY
        gesture.origin = 0
      } else {
        return
      }
    }

    const next = Math.min(sheetOffset('peek'), Math.max(0, gesture.origin + (event.clientY - gesture.startY)))
    setDragY(next)
  }

  function onSheetUp(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current
    if (!gesture.active || event.pointerId !== gesture.pointerId) return
    gesture.lastY = event.clientY
    const delta = gesture.lastY - gesture.startY
    if (gesture.mode === 'undecided' && Math.abs(delta) >= 8) {
      const body = bodyRef.current
      const overflowing = !!body && body.scrollHeight > body.clientHeight + 1
      const atTop = !body || body.scrollTop <= 0
      gesture.mode =
        level === 'full' && overflowing && gesture.inBody && (delta < 0 || !atTop) ? 'scroll' : 'sheet'
      gesture.moved = gesture.mode === 'sheet'
      if (gesture.mode === 'scroll' && body) body.scrollTop -= delta
    }
    const current = Math.min(sheetOffset('peek'), Math.max(0, gesture.origin + delta))
    const moved = gesture.moved && gesture.mode === 'sheet'
    gesture.active = false
    gesture.mode = 'undecided'
    setDragY(null)
    if (!moved) return
    gesture.suppressClick = true
    window.setTimeout(() => {
      gesture.suppressClick = false
    }, 400)
    const points = snapPoints()
    if (delta < -36) {
      const next = points.filter((point) => point.y < current - 12).sort((a, b) => b.y - a.y)[0]
      if (next) {
        setLevel(next.level)
        return
      }
    }
    if (delta > 36) {
      const next = points.filter((point) => point.y > current + 12).sort((a, b) => a.y - b.y)[0]
      if (next) {
        setLevel(next.level)
        return
      }
    }
    const nearest = points.reduce((best, point) =>
      Math.abs(point.y - current) < Math.abs(best.y - current) ? point : best,
    )
    setLevel(nearest.level)
  }

  function onHandleClick() {
    if (drag.current.suppressClick) {
      drag.current.suppressClick = false
      return
    }
    setLevel((current) => {
      if (current === 'full') return selection ? 'mid' : 'peek'
      if (current === 'mid') return 'full'
      return selection ? 'mid' : 'full'
    })
  }

  const totals = trip
    ? trip.legs.reduce(
        (sum, leg) => ({
          time: sum.time + leg.timeSec,
          length: sum.length + leg.lengthKm,
        }),
        { time: 0, length: 0 },
      )
    : null

  return (
    <div className="shell" style={{ ['--peek' as string]: `${peek}px`, ['--mid' as string]: `${mid}px` }}>
      <MapView
        ref={mapRef}
        stations={visibleStations}
        selectedId={selectedId}
        origin={origin}
        destination={destination}
        userLocation={userLocation}
        userHeading={userLocation?.heading ?? null}
        userMoving={userLocation?.moving ?? false}
        following={following}
        followToken={followToken}
        bottomInset={level === 'mid' ? mid : peek}
        legs={trip?.legs ?? []}
        showBikeLanes={showBikeLanes}
        onSelectStation={selectStation}
        onHoldPlace={(point, stationId) => void holdOnMap(point, stationId)}
        onUserPan={() => {
          pauseFollow()
          mapRef.current?.northUp()
        }}
      />

      <button
        className={locating ? 'locate busy' : following ? 'locate following' : 'locate'}
        type="button"
        onClick={() => void goToMyLocation()}
        aria-label={following ? t.followingLocation : trip ? t.followRoute : t.myLocation}
        aria-pressed={following}
        aria-busy={locating}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle className="locate-dot" cx="12" cy="12" r="2.6" />
        </svg>
      </button>

      <section
        className={`sheet ${level}`}
        ref={sheetRef}
        style={dragY === null ? undefined : { transform: `translateY(${dragY}px)`, transition: 'none' }}
        onPointerDown={onSheetDown}
        onPointerMove={onSheetMove}
        onPointerUp={onSheetUp}
        onPointerCancel={onSheetUp}
        onClickCapture={(event) => {
          if (!drag.current.suppressClick) return
          event.preventDefault()
          event.stopPropagation()
          drag.current.suppressClick = false
        }}
      >
        <div className="sheet-mid" ref={midRef}>
          <div className="sheet-peek" ref={peekRef}>
            <button className="handle-hit" type="button" aria-label={t.moreInfo} onClick={onHandleClick}>
              <span className="handle" />
            </button>
            <div className="planner">
              <div className="planner-rail">
                <span className="planner-circle" aria-hidden="true" />
                <span className="planner-dots" aria-hidden="true" />
                <button
                  className={showBikeLanes ? 'planner-pin active' : 'planner-pin'}
                  type="button"
                  aria-pressed={showBikeLanes}
                  aria-label={t.bikeLanes}
                  onClick={() => setShowBikeLanes((current) => !current)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" />
                    <circle cx="12" cy="10" r="2.5" fill="#fff" />
                  </svg>
                </button>
              </div>
              <div className="planner-fields">
                <label className={editing === 'origin' ? 'planner-field focused' : 'planner-field'}>
                  <span className="sr-only">{t.startPlaceholder}</span>
                  <input
                    ref={originRef}
                    value={editing === 'origin' ? query : originText()}
                    placeholder={lookingUp && editing === 'origin' ? t.findingAddress : t.startPlaceholder}
                    readOnly={editing !== 'origin'}
                    onFocus={() => {
                      if (editing === 'origin') return
                      setEditing('origin')
                      setQuery('')
                      setLevel('full')
                    }}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setEditing('origin')
                      setLevel('full')
                    }}
                    onBlur={() => {
                      if (editing !== 'origin') return
                      setQuery('')
                      setEditing(null)
                      setLevel((current) => (selection && current === 'full' ? 'mid' : current))
                    }}
                  />
                  {searchingAddresses && editing === 'origin' && (
                    <span className="search-spin" role="status" aria-label={t.findingAddress} />
                  )}
                  <button
                    className="planner-search"
                    type="button"
                    aria-label={t.search}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => originRef.current?.focus()}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M16 16.5L20 20.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </label>
                <label className={editing === 'destination' ? 'planner-field focused' : 'planner-field'}>
                  <span className="sr-only">{t.destinationPlaceholder}</span>
                  <input
                    ref={searchRef}
                    value={editing === 'destination' ? query : selection?.label ?? ''}
                    placeholder={
                      lookingUp && selection && !selection.label ? t.findingAddress : t.destinationPlaceholder
                    }
                    readOnly={editing !== 'destination'}
                    onFocus={() => {
                      if (editing === 'destination') return
                      setEditing('destination')
                      setQuery(selection?.label ?? '')
                      setLevel('full')
                      if (selection?.label) requestAnimationFrame(() => searchRef.current?.select())
                    }}
                    onChange={(event) => {
                      const next = event.target.value
                      setQuery(next)
                      setEditing('destination')
                      setLevel('full')
                      if (selection && next !== selection.label) {
                        setSelection(null)
                        setDestination(null)
                        setTrip(null)
                        setRouteError(null)
                      }
                    }}
                    onBlur={() => {
                      if (editing !== 'destination') return
                      if (!selection || query === '' || query === selection.label) {
                        setQuery('')
                        setEditing(null)
                        setLevel((current) => (selection && current === 'full' ? 'mid' : current))
                      }
                    }}
                  />
                  {searchingAddresses && editing === 'destination' && (
                    <span className="search-spin" role="status" aria-label={t.findingAddress} />
                  )}
                </label>
              </div>
              <button className="planner-swap" type="button" onClick={swapEnds} aria-label={t.swap}>
                <svg viewBox="0 0 24 28" aria-hidden="true">
                  <path d="M7 13V5M7 5L3.5 8.5M7 5l3.5 3.5M17 15v8M17 23l-3.5-3.5M17 23l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {selection && !editing && (
              <>
                {routeError && <p className="error">{routeError}</p>}
                {locationNote === 'failed' && <p className="error">{t.locationFailed}</p>}
                <div className="start-actions">
                  <button className="btn" type="button" disabled={routing} onClick={() => void startTrip()}>
                    {routing ? t.calculating : t.start}
                  </button>
                </div>
              </>
            )}
          </div>

          {selection && !editing && !selected && (
            <article className="station">
              <h2>{lookingUp ? t.findingAddress : selection.label || t.mapPoint}</h2>
            </article>
          )}

          {selected && !editing && (
            <article className="station">
              <div className="station-head">
                {selected.number && <span className="badge">{selected.number}</span>}
                <div>
                  <h2>{selection?.label || selected.title}</h2>
                  <p>
                    {selected.online ? t.online : t.offline} · {formatUpdated(selected.lastSeen, t.updated, t.noUpdate)}
                  </p>
                </div>
              </div>
              <Meter label={t.bikes} value={selected.bikesAvailable} total={selected.capacity} />
              <Meter label={t.docks} value={selected.docksAvailable} total={selected.capacity} />
            </article>
          )}
        </div>

        <div className="sheet-body" ref={bodyRef}>
          <div className="brand-row">
            <div className="brand">
              bici<span>Cas</span>
            </div>
            <div className="brand-tools">
              <div className="langs" role="group" aria-label={t.language}>
                {(['es', 'va', 'en'] as const).map((code) => (
                  <button
                    key={code}
                    className={locale === code ? 'lang active' : 'lang'}
                    type="button"
                    aria-pressed={locale === code}
                    onClick={() => setLocale(code)}
                  >
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                className="icon-btn"
                type="button"
                onClick={() => {
                  setLoadingStations(true)
                  void fetchStations()
                    .then((next) => {
                      setStations(next)
                      setStationsError(null)
                    })
                    .catch(() => {
                      setStationsError('refresh')
                    })
                    .finally(() => setLoadingStations(false))
                }}
                aria-label={t.refresh}
              >
                ↻
              </button>
            </div>
          </div>
          {locationNote === 'missing' && <p className="muted peek-note">{t.noLocation}</p>}
          {locationNote === 'failed' && !(selection && !editing) && (
            <p className="muted peek-note">{t.locationFailed}</p>
          )}
          <div className="filters">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              {t.filterAll}
            </FilterChip>
            <FilterChip active={filter === 'bikes'} onClick={() => setFilter('bikes')}>
              {t.filterBikes}
            </FilterChip>
            <FilterChip active={filter === 'docks'} onClick={() => setFilter('docks')}>
              {t.filterDocks}
            </FilterChip>
          </div>

          {selection && !editing && (
            <button className="btn secondary leave-wide" type="button" onClick={leaveFromHere}>
              {t.leaveHere}
            </button>
          )}

          {selection && (
            <form
              className="save-row"
              onSubmit={(event) => {
                event.preventDefault()
                saveFavorite()
              }}
            >
              <input
                ref={nameRef}
                value={draftName}
                placeholder={t.favoriteName}
                aria-label={t.favoriteName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <button className="btn" type="submit" disabled={!draftName.trim() || lookingUp}>
                {savedFavorite ? t.saved : t.saveFavorite}
              </button>
              {savedFavorite && (
                <button className="btn secondary" type="button" onClick={() => removeFavorite(savedFavorite.id)}>
                  {t.removeFavorite}
                </button>
              )}
            </form>
          )}

          {loadingStations && stations.length === 0 && <p className="muted">{t.loading}</p>}
          {stationsError && (
            <p className="error">{stationsError === 'load' ? t.loadError : t.refreshError}</p>
          )}

          {routeError && !(selection && !editing) && <p className="error">{routeError}</p>}

          {trip && totals && (
            <div className="trip">
              <div className="trip-total">
                <strong>{formatDuration(totals.time)}</strong>
                <span>{formatDistance(totals.length, locale)}</span>
              </div>
              <p className="trip-stations">
                <RichText
                  template={t.summary}
                  values={{ pickup: trip.pickup.title, dropoff: trip.dropoff.title }}
                />
              </p>
              {trip.warnings.map((warning) => (
                <p className="warning" key={`${warning.code}-${warning.station}`}>
                  {warningText(warning, t)}
                </p>
              ))}
              <ol className="legs">
                {trip.legs.map((leg, index) => (
                  <li key={`${leg.mode}-${index}`}>
                    <div>
                      <strong>{leg.mode === 'bike' ? t.byBike : t.onFoot}</strong>
                      <span>{fill(t.until, { place: leg.toLabel })}</span>
                    </div>
                    <em>
                      {formatDuration(leg.timeSec)} · {formatDistance(leg.lengthKm, locale)}
                    </em>
                    <details>
                      <summary>{t.directions}</summary>
                      <ol>
                        {leg.maneuvers.map((maneuver, step) => (
                          <li key={step}>{maneuver.instruction}</li>
                        ))}
                      </ol>
                    </details>
                  </li>
                ))}
            </ol>
          </div>
        )}

          {matchedFavorites.length > 0 && (
            <>
              <h3 className="list-title">{t.favorites}</h3>
              <ul className="results">
                {matchedFavorites.map((favorite) => {
                  const station = stations.find((item) => item.id === favorite.stationId)
                  return (
                    <li key={favorite.id}>
                      <button
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() =>
                          choosePlace({
                            lng: favorite.lng,
                            lat: favorite.lat,
                            label: favorite.name,
                            stationId: favorite.stationId,
                          })
                        }
                      >
                        <i className="fav-mark" />
                        <span>
                          <strong>{favorite.name}</strong>
                          <em>
                            {station ? `${station.title} · ${station.bikesAvailable} ${t.bikesShort}` : ''}
                            {station && userLocation ? ' · ' : ''}
                            {userLocation
                              ? formatDistance(distanceMeters(userLocation, favorite) / 1000, locale)
                              : ''}
                          </em>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {editing && searchingAddresses && addresses.length === 0 && (
            <p className="empty-search search-pending">
              <span className="search-spin" aria-hidden="true" />
              {t.findingAddress}
            </p>
          )}

          {editing && addresses.length > 0 && (
            <>
              <h3 className="list-title">{t.addresses}</h3>
              <ul className="results">
                {addresses.map((address) => {
                  const formatted = formatAddress(address, locale)
                  const distance = userLocation
                    ? formatDistance(distanceMeters(userLocation, address) / 1000, locale)
                    : ''
                  const detail = [formatted.detail, distance].filter(Boolean).join(' · ')
                  return (
                    <li key={address.id}>
                      <button
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() =>
                          choosePlace(
                            { lng: address.lng, lat: address.lat, label: formatted.title },
                            editingRef.current === 'origin' ? 'origin' : 'destination',
                          )
                        }
                      >
                        <i className="addr-mark" />
                        <span>
                          <strong>{formatted.title}</strong>
                          {detail && <em>{detail}</em>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {query.trim().length >= 2 &&
            addressQuery === query.trim() &&
            listed.length === 0 &&
            matchedFavorites.length === 0 &&
            addresses.length === 0 &&
            !searchingAddresses && <p className="empty-search">{t.noResults}</p>}
          {!query.trim() && (
            <>
              <h3 className="list-title">{t.nearby}</h3>
              <ul className="results">
                <li>
                  <button
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => void chooseHere()}
                  >
                    <i className="loc-mark" />
                    <span>
                      <strong>{t.yourLocation}</strong>
                    </span>
                  </button>
                </li>
                {listed.map((station) => (
                  <li key={station.id}>
                    <button
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => chooseStation(station)}
                    >
                      <i
                        style={{
                          background: stationFill(station),
                          boxShadow: `0 0 0 2px ${dockBorder(station)}`,
                        }}
                      />
                      <span>
                        <strong>{station.title}</strong>
                        <em>
                          {station.bikesAvailable} {t.bikesShort} · {station.docksAvailable} {t.docksShort}
                          {userLocation
                            ? ` · ${formatDistance(distanceMeters(userLocation, station) / 1000, locale)}`
                            : ''}
                        </em>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {query.trim() && listed.length > 0 && (
            <>
          <h3 className="list-title">{t.search}</h3>
            <ul className="results">
              {listed.map((station) => (
                <li key={station.id}>
                  <button
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => chooseStation(station)}
                  >
                    <i
                      style={{
                        background: stationFill(station),
                        boxShadow: `0 0 0 2px ${dockBorder(station)}`,
                      }}
                    />
                    <span>
                      <strong>{station.title}</strong>
                      <em>
                        {station.bikesAvailable} {t.bikesShort} · {station.docksAvailable} {t.docksShort}
                        {userLocation
                          ? ` · ${formatDistance(distanceMeters(userLocation, station) / 1000, locale)}`
                          : ''}
                      </em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}

          <p className="footnote">
            {fill(t.footnoteBefore, { count: stations.length })}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © OpenStreetMap contributors
            </a>
            {t.footnoteAfter}
          </p>
        </div>
      </section>
    </div>
  )
}

function matchFavorite(items: Favorite[], place: Place) {
  return items.find(
    (item) =>
      (place.stationId && item.stationId === place.stationId) ||
      (Math.abs(item.lng - place.lng) < 0.00001 && Math.abs(item.lat - place.lat) < 0.00001),
  )
}

function matchesFilter(station: Station, filter: StationFilter) {
  if (filter === 'bikes') return station.online && station.bikesAvailable > 0
  if (filter === 'docks') return station.online && station.docksAvailable > 0
  return true
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button className={active ? 'chip active' : 'chip'} type="button" onClick={onClick}>
      {children}
    </button>
  )
}

function warningText(warning: TripWarning, messages: Messages) {
  if (warning.code === 'offline') return fill(messages.offlineWarning, { station: warning.station })
  if (warning.code === 'noBikes') return fill(messages.noBikesWarning, { station: warning.station })
  return fill(messages.noDocksWarning, { station: warning.station })
}

function RichText({ template, values }: { template: string; values: Record<string, string> }) {
  const chunks: Array<string | { name: string; value: string }> = []
  const pattern = /\{(\w+)\}/g
  let last = 0
  for (let match = pattern.exec(template); match; match = pattern.exec(template)) {
    if (match.index > last) chunks.push(template.slice(last, match.index))
    chunks.push({ name: match[1], value: values[match[1]] ?? '' })
    last = match.index + match[0].length
  }
  if (last < template.length) chunks.push(template.slice(last))
  return chunks.map((chunk, index) =>
    typeof chunk === 'string' ? (
      <span key={index}>{chunk}</span>
    ) : (
      <b key={`${chunk.name}-${index}`}>{chunk.value}</b>
    ),
  )
}

function Meter({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <strong>
          {value}
          <small>/{total}</small>
        </strong>
      </div>
      <div className="bar">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
