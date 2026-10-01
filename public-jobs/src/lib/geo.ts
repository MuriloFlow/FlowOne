// "Onde?" — cidades do Brasil (IBGE) + cidades próximas.
//
// • Autocomplete: base completa de municípios do IBGE (carregada 1x e cacheada
//   no navegador) com matching tolerante a acento/erro ("riberao pires" →
//   "Ribeirão Pires, SP").
// • Cidades próximas: quando a cidade não tem vagas, procuramos até 3 cidades
//   vizinhas na MESMA LINHA da CPTM (trem) — ex.: Ribeirão Pires → Santo
//   André, Mauá, Rio Grande da Serra. Fora da malha ferroviária, usamos a
//   geolocalização (OpenStreetMap) para achar os municípios mais perto.

import { normalize, wordSimilarity } from './fuzzy'

export type City = { name: string; uf: string }

export function cityLabel(city: City): string {
  return `${city.name}, ${city.uf}`
}

// ---------------------------------------------------------------------------
// Base de municípios (IBGE)
// ---------------------------------------------------------------------------

const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'
const CACHE_KEY = 'recruta:cities:v1'
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 dias

type RawMunicipality = {
  nome: string
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } }
  regiao?: { sigla?: string }
}

let citiesCache: City[] | null = null
let loading: Promise<City[]> | null = null

function readCache(): City[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; list: string[] }
    if (!parsed?.list?.length) return null
    if (Date.now() - parsed.at > CACHE_TTL) return null
    return parsed.list.map((item) => {
      const [name, uf] = item.split('|')
      return { name, uf: uf ?? '' }
    })
  } catch {
    return null
  }
}

function writeCache(list: City[]): void {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), list: list.map((city) => `${city.name}|${city.uf}`) })
    )
  } catch {
    /* cache é opcional */
  }
}

/** Carrega (uma vez) a lista de municípios do Brasil. */
export function loadCities(): Promise<City[]> {
  if (citiesCache) return Promise.resolve(citiesCache)
  const cached = readCache()
  if (cached) {
    citiesCache = cached
    return Promise.resolve(cached)
  }
  if (loading) return loading
  loading = fetch(IBGE_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`IBGE ${response.status}`)
      return response.json() as Promise<RawMunicipality[]>
    })
    .then((data) => {
      const list: City[] = data
        .map((item) => ({
          name: item.nome,
          uf: item.microrregiao?.mesorregiao?.UF?.sigla ?? ''
        }))
        .filter((city) => city.name && city.uf)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      citiesCache = list
      writeCache(list)
      return list
    })
    .finally(() => {
      loading = null
    })
  return loading
}

/** Cidades que aparecem antes de digitar qualquer coisa. */
const POPULAR = [
  ['São Paulo', 'SP'],
  ['Santo André', 'SP'],
  ['Ribeirão Pires', 'SP'],
  ['Guarulhos', 'SP'],
  ['Osasco', 'SP'],
  ['Campinas', 'SP'],
  ['Rio de Janeiro', 'RJ'],
  ['Belo Horizonte', 'MG'],
  ['Curitiba', 'PR'],
  ['Porto Alegre', 'RS']
] as const

export function popularCities(): City[] {
  return POPULAR.map(([name, uf]) => ({ name, uf }))
}

/** Autocomplete: ranqueia as cidades mais parecidas com o que foi digitado. */
export async function searchCities(term: string, limit = 8): Promise<City[]> {
  const query = normalize(term)
  if (!query) return popularCities().slice(0, limit)
  const list = await loadCities()
  const parts = query.split(' ').filter(Boolean)

  const scored: Array<{ city: City; score: number; order: number }> = []
  for (const city of list) {
    const name = normalize(city.name)
    const uf = normalize(city.uf)
    let score = 0

    if (name === query) score = 1.4
    else if (name.startsWith(query)) score = 1.2 - Math.min(0.2, name.length / 200)
    else if (name.includes(query)) score = 1.0
    else {
      // Todos os pedaços digitados precisam aparecer (mesmo com erro).
      let sum = 0
      let matched = 0
      for (const part of parts) {
        let best = 0
        for (const word of name.split(' ')) {
          const similarity = wordSimilarity(part, word)
          if (similarity > best) best = similarity
        }
        if (best >= 0.6) {
          matched += 1
          sum += best
        }
      }
      if (matched === parts.length) score = 0.85 * (sum / parts.length)
    }

    // Bônus se o estado foi digitado junto ("ribeirao pires sp").
    if (score > 0 && parts.length > 1 && uf && parts.includes(uf)) score += 0.25
    if (score > 0) scored.push({ city, score, order: city.name.length })
  }

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.02) return b.score - a.score
    return a.order - b.order
  })
  return scored.slice(0, limit).map((item) => item.city)
}

/** Interpreta texto livre: "ribeirao pires - sp", "São Paulo, SP", "Osasco". */
export async function parseCityInput(value: string): Promise<City | null> {
  const clean = value.replace(/\s*[-–]\s*/g, ', ').trim()
  if (!clean) return null
  const match = /^(.*?)[,\s]*\b([A-Za-z]{2})\b\s*$/.exec(clean)
  const name = (match?.[1] ?? clean).trim().replace(/,\s*$/, '')
  const uf = match?.[2]?.toUpperCase() ?? ''
  const results = await searchCities(name, 12)
  if (results.length === 0) return null
  if (uf && uf.length === 2) {
    const inUf = results.find((city) => city.uf.toUpperCase() === uf)
    if (inUf) return inUf
  }
  const exact = results.find((city) => normalize(city.name) === normalize(name))
  return exact ?? results[0]
}

// ---------------------------------------------------------------------------
// Linhas da CPTM (trem) — cidades servidas, na ordem das estações
// ---------------------------------------------------------------------------

export type TrainLine = { name: string; color: string; cities: string[] }

export const CPTM_LINES: TrainLine[] = [
  {
    name: 'Linha 7-Rubi',
    color: '#B02E28',
    cities: [
      'São Paulo',
      'Caieiras',
      'Franco da Rocha',
      'Francisco Morato',
      'Campo Limpo Paulista',
      'Várzea Paulista',
      'Jundiaí'
    ]
  },
  {
    name: 'Linha 8-Diamante',
    color: '#8C8C8C',
    cities: ['São Paulo', 'Osasco', 'Carapicuíba', 'Barueri', 'Jandira', 'Itapevi']
  },
  {
    name: 'Linha 9-Esmeralda',
    color: '#1E9E4A',
    cities: ['São Paulo', 'Osasco']
  },
  {
    name: 'Linha 10-Turquesa',
    color: '#00768F',
    cities: ['São Paulo', 'Santo André', 'Mauá', 'Ribeirão Pires', 'Rio Grande da Serra']
  },
  {
    name: 'Linha 11-Coral',
    color: '#D1503C',
    cities: ['São Paulo', 'Ferraz de Vasconcelos', 'Poá', 'Suzano', 'Mogi das Cruzes']
  },
  {
    name: 'Linha 12-Safira',
    color: '#1B3C87',
    cities: ['São Paulo', 'Itaquaquecetuba', 'Poá']
  },
  {
    name: 'Linha 13-Jade',
    color: '#0E7C5A',
    cities: ['São Paulo', 'Guarulhos']
  }
]

/** Cidades vizinhas na mesma linha do trem (até `limit`). */
export function cptmNeighbors(cityName: string, limit = 3): { cities: string[]; line: TrainLine } | null {
  const target = normalize(cityName)
  if (!target) return null
  for (const line of CPTM_LINES) {
    const index = line.cities.findIndex((city) => normalize(city) === target)
    if (index === -1) continue
    const ranked: Array<{ city: string; distance: number }> = []
    line.cities.forEach((city, position) => {
      if (position === index) return
      if (normalize(city) === target) return
      ranked.push({ city, distance: Math.abs(position - index) })
    })
    ranked.sort((a, b) => a.distance - b.distance)
    const cities: string[] = []
    for (const item of ranked) {
      if (cities.length >= limit) break
      if (!cities.includes(item.city)) cities.push(item.city)
    }
    if (cities.length > 0) return { cities, line }
  }
  return null
}

/** Nome da linha do trem que atende a cidade (se houver). */
export function cptmLineFor(cityName: string): TrainLine | null {
  const target = normalize(cityName)
  return CPTM_LINES.find((line) => line.cities.some((city) => normalize(city) === target)) ?? null
}

// ---------------------------------------------------------------------------
// Cidades próximas fora da malha ferroviária (OpenStreetMap)
// ---------------------------------------------------------------------------

const NEARBY_KEY = 'recruta:nearby:v1'
const NEARBY_TTL = 15 * 24 * 60 * 60 * 1000

function nearbyCacheGet(key: string): City[] | null {
  try {
    const raw = window.localStorage.getItem(NEARBY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, { at: number; list: City[] }>
    const hit = parsed[key]
    if (!hit || Date.now() - hit.at > NEARBY_TTL) return null
    return hit.list
  } catch {
    return null
  }
}

function nearbyCacheSet(key: string, list: City[]): void {
  try {
    const raw = window.localStorage.getItem(NEARBY_KEY)
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, { at: number; list: City[] }>
    parsed[key] = { at: Date.now(), list }
    const keys = Object.keys(parsed)
    if (keys.length > 40) delete parsed[keys[0]]
    window.localStorage.setItem(NEARBY_KEY, JSON.stringify(parsed))
  } catch {
    /* opcional */
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ])
}

type OverpassNode = { lat: number; lon: number; tags?: Record<string, string> }

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=Brazil&city=${encodeURIComponent(city)}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  const data = (await response.json()) as Array<{ lat: string; lon: string }>
  if (!data.length) return null
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) }
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

async function nearbyByMap(city: string, limit: number): Promise<City[]> {
  const point = await withTimeout(geocode(city), 8000)
  if (!point) return []
  const query = `[out:json][timeout:12];(node(around:40000,${point.lat},${point.lon})["place"~"^(city|town)$"]["name"];);out body 120;`
  const response = await withTimeout(
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`),
    12000
  )
  if (!response || !response.ok) return []
  const data = (await response.json()) as { elements?: OverpassNode[] }
  const nodes = data.elements ?? []
  const known = await withTimeout(loadCities(), 6000)
  const seen = new Set<string>([normalize(city)])
  const ranked = nodes
    .map((node) => ({
      name: node.tags?.name ?? '',
      distance: haversine(point, { lat: node.lat, lon: node.lon })
    }))
    .filter((item) => item.name && item.distance > 4)
    .sort((a, b) => a.distance - b.distance)

  const result: City[] = []
  for (const item of ranked) {
    const key = normalize(item.name)
    if (seen.has(key)) continue
    seen.add(key)
    const match = known?.find((entry) => normalize(entry.name) === key)
    result.push({ name: match?.name ?? item.name, uf: match?.uf ?? '' })
    if (result.length >= limit) break
  }
  return result
}

export type NearbyResult = { cities: string[]; source: 'cptm' | 'mapa'; line: string | null }

/**
 * Cidades próximas para quando a busca na cidade não trouxe vagas:
 * primeiro pela linha da CPTM (trem) e, se a cidade não tiver trem,
 * pelo municípios mais próximos no mapa.
 */
export async function nearbyCities(cityName: string, limit = 3): Promise<NearbyResult> {
  const clean = cityName.split(',')[0].trim()
  if (!clean) return { cities: [], source: 'cptm', line: null }
  const cached = nearbyCacheGet(normalize(clean))
  if (cached) {
    const line = cptmLineFor(clean)
    return {
      cities: cached.map((city) => city.name),
      source: line ? 'cptm' : 'mapa',
      line: line?.name ?? null
    }
  }

  const train = cptmNeighbors(clean, limit)
  if (train) {
    const cities = train.cities.map((name) => ({ name, uf: '' }))
    nearbyCacheSet(normalize(clean), cities)
    return { cities: train.cities, source: 'cptm', line: train.line.name }
  }

  const mapped = await nearbyByMap(clean, limit)
  if (mapped.length > 0) {
    nearbyCacheSet(normalize(clean), mapped)
    return { cities: mapped.map((city) => city.name), source: 'mapa', line: null }
  }
  return { cities: [], source: 'mapa', line: null }
}
