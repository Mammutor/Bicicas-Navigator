import { useEffect, useState } from 'react'

export type Locale = 'es' | 'en' | 'va'

const STORAGE_KEY = 'bicicas-locale'

const messages = {
  es: {
    language: 'Idioma',
    appTitle: 'biciCas Navegador',
    brand: 'Navegador',
    search: 'Buscar',
    whereTo: '¿A dónde?',
    nearby: 'Cercanas',
    addresses: 'Lugares',
    favorites: 'Favoritos',
    favoriteName: 'Nombre del favorito',
    findingAddress: 'Buscando la dirección…',
    saveFavorite: 'Guardar',
    saved: 'Guardado',
    removeFavorite: 'Quitar',
    start: 'Empezar',
    change: 'Cambiar',
    yourLocation: 'Tu ubicación',
    startPlaceholder: 'Elige el inicio o toca el mapa',
    destinationPlaceholder: 'Introduce el destino',
    swap: 'Cambiar origen y destino',
    moreInfo: 'Más información',
    fromYou: 'Desde tu ubicación',
    approximate: 'Ubicación aproximada',
    noResults: 'Nada coincide.',
    filterAll: 'Todas',
    filterBikes: 'Con bicis',
    filterDocks: 'Con sitio',
    refresh: 'Actualizar estaciones',
    bikeLanes: 'Carriles bici',
    loading: 'Cargando estaciones…',
    online: 'En línea',
    offline: 'Fuera de servicio',
    updated: 'Actualizado {time}',
    noUpdate: 'Sin hora de actualización',
    bikes: 'Bicicletas',
    docks: 'Anclajes libres',
    bikesShort: 'bicis',
    docksShort: 'anclajes',
    leaveHere: 'Salir de aquí',
    goHere: 'Ir a esta estación',
    from: 'Desde',
    to: 'Hasta',
    chooseOrigin: 'Elige un origen',
    chooseDestination: 'Elige un destino',
    onMap: 'En el mapa',
    calculate: 'Calcular ruta',
    calculating: 'Calculando…',
    pickOrigin: 'Toca el mapa para el origen',
    pickDestination: 'Toca el mapa para el destino',
    myLocation: 'Mi ubicación',
    followingLocation: 'Siguiendo tu ubicación',
    followRoute: 'Seguir la ruta',
    mapPoint: 'Punto en el mapa',
    noLocation: 'No se ha podido situar este dispositivo.',
    locationFailed: 'No se pudo leer la ubicación de este dispositivo.',
    summary: 'Recoges en {pickup} y dejas la bici en {dropoff}.',
    byBike: 'En bici',
    onFoot: 'A pie',
    until: 'hasta {place}',
    directions: 'Indicaciones',
    footnoteBefore: '{count} estaciones · ',
    footnoteAfter: ' · rutas Valhalla',
    loadError: 'No se pudieron cargar las estaciones.',
    refreshError: 'Error al actualizar.',
    routeError: 'No se pudo calcular la ruta.',
    noStations: 'Todavía no hay estaciones cargadas.',
    sameStation: 'El origen y el destino son la misma estación.',
    noBikes: 'No hay estaciones en línea con bicicletas libres.',
    noDocks: 'No hay estaciones en línea con anclajes libres para dejar la bici.',
    samePickup: 'La estación de salida y la de llegada coinciden. Elige otro destino.',
    legFailed: 'No se pudo calcular este tramo del camino.',
    offlineWarning: '{station} figura fuera de servicio.',
    noBikesWarning: '{station} no tiene bicicletas ahora mismo.',
    noDocksWarning: '{station} no tiene anclajes libres.',
  },
  en: {
    language: 'Language',
    appTitle: 'biciCas Navigator',
    brand: 'Navigator',
    search: 'Search',
    whereTo: 'Where to?',
    nearby: 'Nearby',
    addresses: 'Places',
    favorites: 'Favorites',
    favoriteName: 'Favorite name',
    findingAddress: 'Looking up the address…',
    saveFavorite: 'Save',
    saved: 'Saved',
    removeFavorite: 'Remove',
    start: 'Start',
    change: 'Change',
    yourLocation: 'Your location',
    startPlaceholder: 'Choose a start or tap the map',
    destinationPlaceholder: 'Enter a destination',
    swap: 'Swap start and destination',
    moreInfo: 'More information',
    fromYou: 'From your location',
    approximate: 'Approximate location',
    noResults: 'Nothing matches.',
    filterAll: 'All',
    filterBikes: 'With bikes',
    filterDocks: 'With docks',
    refresh: 'Refresh stations',
    bikeLanes: 'Bike lanes',
    loading: 'Loading stations…',
    online: 'Online',
    offline: 'Out of service',
    updated: 'Updated {time}',
    noUpdate: 'No update time',
    bikes: 'Bicycles',
    docks: 'Free docks',
    bikesShort: 'bikes',
    docksShort: 'docks',
    leaveHere: 'Leave from here',
    goHere: 'Go to this station',
    from: 'From',
    to: 'To',
    chooseOrigin: 'Choose a start',
    chooseDestination: 'Choose a destination',
    onMap: 'On the map',
    calculate: 'Calculate route',
    calculating: 'Calculating…',
    pickOrigin: 'Tap the map to set the start',
    pickDestination: 'Tap the map to set the destination',
    myLocation: 'My location',
    followingLocation: 'Following your location',
    followRoute: 'Follow the route',
    mapPoint: 'Point on the map',
    noLocation: 'This device could not be located.',
    locationFailed: 'This device’s location could not be read.',
    summary: 'Pick up at {pickup} and drop the bike at {dropoff}.',
    byBike: 'By bike',
    onFoot: 'On foot',
    until: 'to {place}',
    directions: 'Directions',
    footnoteBefore: '{count} stations · ',
    footnoteAfter: ' · Valhalla routing',
    loadError: 'The stations could not be loaded.',
    refreshError: 'Could not refresh.',
    routeError: 'The route could not be calculated.',
    noStations: 'Stations are not loaded yet.',
    sameStation: 'The start and destination are the same station.',
    noBikes: 'No online station has a free bicycle.',
    noDocks: 'No online station has a free dock to leave the bike.',
    samePickup: 'The pickup and drop-off stations are the same. Choose another destination.',
    legFailed: 'This part of the route could not be calculated.',
    offlineWarning: '{station} is marked out of service.',
    noBikesWarning: '{station} has no bicycles right now.',
    noDocksWarning: '{station} has no free docks.',
  },
  va: {
    language: 'Idioma',
    appTitle: 'Navegador biciCas',
    brand: 'Navegador',
    search: 'Busca',
    whereTo: 'A on?',
    nearby: 'Properes',
    addresses: 'Llocs',
    favorites: 'Favorits',
    favoriteName: 'Nom del favorit',
    findingAddress: 'Buscant l’adreça…',
    saveFavorite: 'Guarda',
    saved: 'Guardat',
    removeFavorite: 'Treu',
    start: 'Comença',
    change: 'Canvia',
    yourLocation: 'La teua ubicació',
    startPlaceholder: 'Tria l’inici o toca el mapa',
    destinationPlaceholder: 'Introdueix la destinació',
    swap: 'Canvia l’origen i la destinació',
    moreInfo: 'Més informació',
    fromYou: 'Des de la teua ubicació',
    approximate: 'Ubicació aproximada',
    noResults: 'Res no coincideix.',
    filterAll: 'Totes',
    filterBikes: 'Amb bicis',
    filterDocks: 'Amb lloc',
    refresh: 'Actualitza les estacions',
    bikeLanes: 'Carrils bici',
    loading: 'Carregant estacions…',
    online: 'En línia',
    offline: 'Fora de servici',
    updated: 'Actualitzat {time}',
    noUpdate: 'Sense hora d’actualització',
    bikes: 'Bicicletes',
    docks: 'Ancoratges lliures',
    bikesShort: 'bicis',
    docksShort: 'ancoratges',
    leaveHere: 'Ix d’ací',
    goHere: 'Ves a esta estació',
    from: 'Des de',
    to: 'Fins a',
    chooseOrigin: 'Tria un origen',
    chooseDestination: 'Tria una destinació',
    onMap: 'Al mapa',
    calculate: 'Calcula la ruta',
    calculating: 'Calculant…',
    pickOrigin: 'Toca el mapa per a l’origen',
    pickDestination: 'Toca el mapa per a la destinació',
    myLocation: 'La meua ubicació',
    followingLocation: 'Seguint la teua ubicació',
    followRoute: 'Segueix la ruta',
    mapPoint: 'Punt al mapa',
    noLocation: 'No s’ha pogut situar este dispositiu.',
    locationFailed: 'No s’ha pogut llegir la ubicació d’este dispositiu.',
    summary: 'Agafes la bici a {pickup} i la deixes a {dropoff}.',
    byBike: 'En bici',
    onFoot: 'A peu',
    until: 'fins a {place}',
    directions: 'Indicacions',
    footnoteBefore: '{count} estacions · ',
    footnoteAfter: ' · rutes Valhalla',
    loadError: 'No s’han pogut carregar les estacions.',
    refreshError: 'No s’ha pogut actualitzar.',
    routeError: 'No s’ha pogut calcular la ruta.',
    noStations: 'Encara no hi ha estacions carregades.',
    sameStation: 'L’origen i la destinació són la mateixa estació.',
    noBikes: 'No hi ha estacions en línia amb bicicletes lliures.',
    noDocks: 'No hi ha estacions en línia amb ancoratges lliures per a deixar la bici.',
    samePickup: 'L’estació d’eixida i la d’arribada coincideixen. Tria una altra destinació.',
    legFailed: 'No s’ha pogut calcular este tram del camí.',
    offlineWarning: '{station} està fora de servici.',
    noBikesWarning: '{station} no té bicicletes ara mateix.',
    noDocksWarning: '{station} no té ancoratges lliures.',
  },
} as const

export type Messages = {
  [Key in keyof (typeof messages)['es']]: string
}

export type TripErrorCode = keyof Pick<
  Messages,
  'noStations' | 'sameStation' | 'noBikes' | 'noDocks' | 'samePickup' | 'legFailed'
>

export function valhallaLanguage(locale: Locale): string {
  if (locale === 'en') return 'en-US'
  if (locale === 'va') return 'ca-ES'
  return 'es-ES'
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'es' || saved === 'en' || saved === 'va') return saved
  } catch {
    // Private browsing can block storage. Fall through to the browser language.
  }
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('en')) return 'en'
  if (lang.startsWith('ca') || lang.includes('valenc')) return 'va'
  return 'es'
}

export function useLocale() {
  const [locale, setLocale] = useState<Locale>(readLocale)

  useEffect(() => {
    document.documentElement.lang = locale === 'va' ? 'ca-ES-valencia' : locale
    document.title = messages[locale].appTitle
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Ignore storage failures and keep the choice for this visit.
    }
  }, [locale])

  return { locale, setLocale, t: messages[locale] }
}
