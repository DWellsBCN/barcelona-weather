export type Weather = {
  /** WMO weather code, as Open-Meteo reports it. */
  code: number
  isDay: boolean
  tempC: number
  windKmh: number
  /** False until a live reading arrives. */
  isLive: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'barcelona-weather': { weather: Shaped<Weather> }
  }
}
