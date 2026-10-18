import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { reverseAddress } from './address'
import { MapView, type MapHandle } from './MapView'
import { readFavorites, writeFavorites, type Favorite } from './favorites'
import { formatDistance, formatDuration, formatUpdated } from './format'
import { distanceMeters, fold, stationFill } from './geo'
import { fill, useLocale, valhallaLanguage, type Messages } from './i18n'
import { clearPositionWatch, readPosition, watchPosition } from './location'
import { planTrip, TripError } from './routing'
import { fetchStations } from './stations'
import type { LngLat, Place, Station, StationFilter, Trip, TripWarning } from './types'

export default function App() {
  const mapRef = useRef<MapHandle>(null)
  const routeToken = useRef(0)
  const sheetRef = useRef<HTMLElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const holdToken = useRef(0)
  const drag = useRef({ startY: 0, origin: 0, moved: false, active: false, lastY: 0, suppressClick: false })
  const [stations, setStations] = useState<Station[]>([])
  const { locale, setLocale, t } = useLocale()
  const [stationsError, setStationsError] = useState<'load' | 'refresh' | null>(null)
  const [loadingStations, setLoadingStations] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StationFilter>('all')
  const [selection, setSelection] = useState<Place | null>(null)
  const [departure, setDeparture] = useState<Place | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>(readFavorites)
  const [draftName, setDraftName] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [userLocation, setUserLocation] = useState<LngLat | null>(null)
  const [approximate, setApproximate] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<'missing' | 'failed' | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState(180)
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

  useEffect(() => {
    let active = true
    let watchId = ''
    async function start() {
      setLocating(true)
      try {
        const point = await readPosition()
        if (!active) return
        setUserLocation(point)
        setApproximate(point.approximate)
        setOrigin((current) => current ?? { ...point, label: '', kind: 'location' })
        setLocationNote(null)
        mapRef.current?.flyTo(point, 14)
        watchId = await watchPosition((next) => {
          if (!active) return
          setUserLocation(next)
          setApproximate(false)
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

  useEffect(() => {
    const el = peekRef.current
    if (!el) return
    const measure = () => setPeek(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [selection, departure, locale])

  useEffect(() => {
    writeFavorites(favorites)
  }, [favorites])

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

  function choosePlace(place: Place) {
    setSelection(place)
    setDestination(place)
    setDraftName(matchFavorite(favorites, place)?.name ?? place.label)
    setQuery('')
    setTrip(null)
    setRouteError(null)
    setOpen(true)
    mapRef.current?.flyTo(place, 16)
  }

  function chooseStation(station: Station) {
    choosePlace(placeFromStation(station))
  }

  function selectStation(id: string) {
    const station = stations.find((item) => item.id === id)
    if (station) chooseStation(station)
  }

  async function holdOnMap(point: LngLat, stationId: string | null) {
    if (stationId) {
      const station = stations.find((item) => item.id === stationId)
      if (station) {
        chooseStation(station)
        requestAnimationFrame(() => nameRef.current?.focus())
        return
      }
    }
    const token = ++holdToken.current
    choosePlace({ ...point, label: '' })
    setLookingUp(true)
    try {
      const address = await reverseAddress(point, valhallaLanguage(locale))
      if (token !== holdToken.current) return
      const place: Place = { ...point, label: address }
      setSelection(place)
      setDestination(place)
      setDraftName(matchFavorite(favorites, place)?.name ?? address)
    } catch {
      if (token !== holdToken.current) return
      setSelection({ ...point, label: t.mapPoint })
      setDraftName('')
    } finally {
      if (token === holdToken.current) {
        setLookingUp(false)
        requestAnimationFrame(() => nameRef.current?.focus())
      }
    }
  }

  function clearSelection() {
    setSelection(null)
    setDestination(null)
    setTrip(null)
    setRouteError(null)
    setQuery('')
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
    setOpen(true)
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
    if (place.kind === 'location') return t.myLocation
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
      setTrip(next)
      setOpen(true)
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
      let point = userLocation
      if (!point) {
        setRouting(true)
        setLocating(true)
        try {
          const fix = await readPosition()
          point = fix
          setUserLocation(fix)
          setApproximate(fix.approximate)
          setLocationNote(null)
        } catch {
          setLocationNote('failed')
          setRouting(false)
          return
        } finally {
          setLocating(false)
        }
      }
      from = { ...point, label: '', kind: 'location' }
    }
    setOrigin(from)
    setDestination(selection)
    await calculate(from, selection)
  }

  async function goToMyLocation() {
    setLocating(true)
    try {
      const point = await readPosition()
      setUserLocation(point)
      setApproximate(point.approximate)
      setOrigin({ ...point, label: '', kind: 'location' })
      setLocationNote(null)
      mapRef.current?.flyTo(point, 15)
    } catch {
      setLocationNote('failed')
      setOpen(true)
    } finally {
      setLocating(false)
    }
  }

  function sheetTravel() {
    const height = sheetRef.current?.offsetHeight ?? 0
    return Math.max(0, height - peek)
  }

  function onPeekDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('input, a, .btn, .lang, .icon-btn, .chip, .results')) return
    drag.current = {
      startY: event.clientY,
      origin: open ? 0 : sheetTravel(),
      moved: false,
      active: true,
      lastY: event.clientY,
      suppressClick: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The pointer is still tracked from pointer move events on the sheet.
    }
  }

  function onPeekMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return
    drag.current.lastY = event.clientY
    const delta = event.clientY - drag.current.startY
    if (Math.abs(delta) > 4) drag.current.moved = true
    const next = Math.min(sheetTravel(), Math.max(0, drag.current.origin + delta))
    setDragY(next)
  }

  function onPeekUp() {
    if (!drag.current.active) return
    const delta = drag.current.lastY - drag.current.startY
    const current = Math.min(sheetTravel(), Math.max(0, drag.current.origin + delta))
    const moved = drag.current.moved
    drag.current.active = false
    drag.current.moved = false
    setDragY(null)
    if (!moved) return
    drag.current.suppressClick = true
    window.setTimeout(() => {
      drag.current.suppressClick = false
    }, 400)
    setOpen(current < sheetTravel() / 2)
  }

  function onHandleClick() {
    if (drag.current.suppressClick) {
      drag.current.suppressClick = false
      return
    }
    setOpen((value) => !value)
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
    <div className="shell" style={{ ['--peek' as string]: `${peek}px` }}>
      <MapView
        ref={mapRef}
        stations={visibleStations}
        selectedId={selectedId}
        origin={origin}
        destination={destination}
        userLocation={userLocation}
        legs={trip?.legs ?? []}
        onSelectStation={selectStation}
        onHoldPlace={(point, stationId) => void holdOnMap(point, stationId)}
      />

      <button
        className={locating ? 'locate busy' : 'locate'}
        type="button"
        onClick={() => void goToMyLocation()}
        aria-label={t.myLocation}
        aria-busy={locating}
      >
        <span aria-hidden="true" />
      </button>

      <section
        className={open ? 'sheet open' : 'sheet'}
        ref={sheetRef}
        style={dragY === null ? undefined : { transform: `translateY(${dragY}px)`, transition: 'none' }}
      >
        <div
          className="sheet-peek"
          ref={peekRef}
          onPointerDown={onPeekDown}
          onPointerMove={onPeekMove}
          onPointerUp={onPeekUp}
          onPointerCancel={onPeekUp}
        >
          <button className="handle-hit" type="button" aria-label={t.moreInfo} onClick={onHandleClick}>
            <span className="handle" />
          </button>
          {departure && (
            <div className="from-chip">
              <span>{t.from}</span>
              <strong>{placeLabel(departure, t.myLocation)}</strong>
              <button
                type="button"
                onClick={() => {
                  setDeparture(null)
                  setTrip(null)
                  setOrigin(userLocation ? { ...userLocation, label: '', kind: 'location' } : null)
                }}
                aria-label={t.clearFrom}
              >
                ×
              </button>
            </div>
          )}
          <label className="search">
            <span className="sr-only">{departure && !selection ? t.whereTo : t.search}</span>
            <input
              ref={searchRef}
              value={query}
              placeholder={departure && !selection ? t.whereTo : t.search}
              onChange={(event) => {
                setQuery(event.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
            />
          </label>
          {selection && (
            <div className="start-row">
              <div>
                <strong>{selection.label}</strong>
                <span>
                  {departure
                    ? `${t.from} ${placeLabel(departure, t.myLocation)}`
                    : approximate
                      ? t.approximate
                      : t.fromYou}
                </span>
              </div>
              <button className="icon-btn" type="button" onClick={clearSelection} aria-label={t.cancel}>
                ×
              </button>
              <div className="start-actions">
                <button className="btn secondary" type="button" onClick={leaveFromHere}>
                  {t.leaveHere}
                </button>
                <button className="btn" type="button" disabled={routing} onClick={() => void startTrip()}>
                  {routing ? t.calculating : t.start}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sheet-body">
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
          {locationNote && (
            <p className="muted peek-note">
              {locationNote === 'missing' ? t.noLocation : t.locationFailed}
            </p>
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

          {selection && !selected && (
            <article className="station">
              <h2>{lookingUp ? t.findingAddress : selection.label || t.mapPoint}</h2>
            </article>
          )}

          {selected && (
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

          {routeError && <p className="error">{routeError}</p>}

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

          {query.trim() && listed.length === 0 && matchedFavorites.length === 0 && (
            <p className="empty-search">{t.noResults}</p>
          )}
          {listed.length > 0 && (
            <>
          <h3 className="list-title">{query.trim() ? t.search : t.nearby}</h3>
            <ul className="results">
              {listed.map((station) => (
                <li key={station.id}>
                  <button type="button" onClick={() => chooseStation(station)}>
                    <i style={{ background: stationFill(station) }} />
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

          <p className="footnote">{fill(t.footnote, { count: stations.length })}</p>
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
