# Barcelona Weather

A sunny Barcelona theme for the Claude desktop and mobile apps. The backdrop shows the city from the beach:
the Collserola ridge with Tibidabo and the TV needle, Montjuïc, the Eixample's warm stone blocks, the basilica's
spires (with a crane, of course), the bullet-shaped tower lit in colour at night, the Mediterranean with a sail
drifting by, Barceloneta sand, a serpentine bench in broken-tile mosaic, palms and bougainvillea.

The sky follows the live weather in Barcelona: sun or moon and stars, more and darker clouds when it's overcast,
rain, drizzle, snow or sea fog, and clouds that drift faster when it's windy. At night the windows light up and
shine on the water.

The app's colours match: Mediterranean blue, senyera red, palm green, saffron gold and bougainvillea magenta,
on warm limestone in light mode and a night-sky navy in dark mode.

- Weather comes from Open-Meteo (free, no key) every 15 minutes. Only Barcelona's coordinates are sent.
- `/bcn-weather` refreshes it now and shows the current reading.
- The status line shows e.g. `Barcelona 22° · Sunny · 12 km/h`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install barcelona-weather --marketplace DWellsBCN/barcelona-weather
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install barcelona-weather --marketplace DWellsBCN/barcelona-weather
```

In the desktop app, where `/plugin` doesn't run: click + next to the prompt box, then Plugins, Add marketplace with `DWellsBCN/barcelona-weather`, then Add plugin.
