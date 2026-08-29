# Maps Converter

App de iOS que aparece en la hoja de compartir de tus apps de mapas: compartes
una ubicación desde una app y la abres en otra.

Soporta **Apple Maps**, **Google Maps** y **Waze** (leer y abrir), además de
enlaces `geo:` y coordenadas sueltas dentro de un texto.

## Cómo funciona

iOS no permite que una extensión abra una app de terceros, así que el recorrido
es siempre el mismo:

```
App de mapas → hoja de compartir → extensión
            → app anfitriona (mapsconverter://share?text=…)
            → parseo del enlace → app de destino
```

El target de la extensión lo crea el config plugin de
[`expo-share-intent`](https://github.com/achorein/expo-share-intent) durante el
`prebuild`, pero `plugins/withoutAppGroup.js` reescribe después su
`ShareViewController.swift` y vacía los entitlements.

El motivo: `expo-share-intent` pasa los datos por un **App Group**, y Apple sólo
concede esa capability a cuentas de pago. Como aquí lo compartido siempre es un
enlace, cabe entero en el propio deep link y el buzón sobra — así la app se
firma con un Apple ID gratuito. El coste es que el plugin depende de dónde
escribe sus ficheros `expo-share-intent`: si lo actualizas, revisa que
`ShareViewController.swift` sigue siendo nuestro después del prebuild.

## Enlaces que entiende

| Origen | Formatos |
| --- | --- |
| Google Maps | `/maps/place/…/@lat,lng/data=!3d…!4d…`, `/maps/search/?api=1&query=`, `/maps/dir/?api=1&destination=`, `maps.google.com/?q=`, `comgooglemaps://` |
| Google Maps (enlaces cortos) | `maps.app.goo.gl/…`, `goo.gl/maps/…`, `share.google/…` — se expanden por red |
| Apple Maps | `?ll=&q=`, `/place?coordinate=&name=&address=`, `maps://?daddr=` |
| Waze | `/ul?ll=`, `/live-map/directions?to=ll.…`, `/ul/h<geohash>`, `waze://` |
| Genérico | `geo:lat,lon`, `geo:0,0?q=…(Etiqueta)`, coordenadas dentro de un mensaje, direcciones en texto plano |

Cuando el enlace trae coordenadas exactas se usan esas; si sólo hay un nombre o
una dirección, se abre como búsqueda en la app de destino.

Los `share.google/…` que genera hoy Google Maps al compartir no llevan a `/maps`
sino a una búsqueda normal (`google.com/search?q=mapa de <sitio>&…&source=sh/x/loc/geo/…`),
sin coordenadas. De ahí se saca el nombre del sitio y se abre como búsqueda; el
marcador `loc/geo` es lo que distingue esa búsqueda de una cualquiera.

Si no hay red para expandir el enlace corto, se recurre al nombre que la app de
origen escribe encima del enlace, así que sigue abriéndose como búsqueda en vez
de fallar.

## Geocodificación

Cuando de un enlace sólo sale un nombre y ninguna coordenada, se consulta
[Nominatim](https://nominatim.org/) (OpenStreetMap) para convertirlo en un pin
exacto: gratis, sin API key ni cuenta. Su política de uso pide identificar la
app —de ahí la cabecera `User-Agent` en `src/maps/geocode.ts`, cámbiala si
haces un fork— y como máximo una petición por segundo, que es justo lo que hace
esta app: una por cada cosa compartida.

Si no encuentra nada, no pasa nada: se abre como búsqueda, igual que antes.
Nominatim busca por coincidencia exacta, así que un nombre con una errata
(«Prta del Sol») no lo resuelve, mientras que Apple Maps o Google sí lo
encuentran con su búsqueda difusa — por eso el destino final sigue siendo una
búsqueda cuando la geocodificación falla, en lugar de un error.

La tarjeta muestra la dirección que devolvió Nominatim junto a las coordenadas,
para que una coincidencia equivocada se vea a simple vista. Del `data=` de Google
se extrae el pin real (`!3d`/`!4d`) en vez del centro de cámara (`@lat,lng`),
que no siempre coincide con el sitio compartido.

Si la app de destino no está instalada, se abre su versión web.

## Desarrollo

Requiere Xcode y un *development build*: la extensión de compartir es código
nativo, así que **Expo Go no sirve**.

El proyecto está fijado a **Expo SDK 54** (RN 0.81) a propósito: el SDK 57
necesita Swift 6.2, que sólo trae Xcode 26, y éste a su vez pide macOS 15.6+.
Con Xcode 16.x hay que quedarse en el 54. Al subir de Xcode se puede migrar,
pero hay que subir también `expo-share-intent` según su tabla de compatibilidad
(SDK 55 → 6.x, SDK 56 → 7.x, SDK 57 → 8.x).

```sh
npm install
npm run ios        # prebuild + pods + compilar + lanzar en el simulador
npm test           # tests del parseo y de la construcción de URLs
npm run typecheck
```

`ios/` y `android/` no se versionan: se regeneran con `npm run prebuild`.

Para probar sin la hoja de compartir, la pantalla principal tiene un campo donde
pegar un enlace directamente.

### Estructura

```
src/maps/parse.ts        de contenido compartido a un `Place`
src/maps/apps.ts         de un `Place` a las URLs de cada app de destino
src/maps/resolve.ts      expansión de enlaces cortos por red
src/maps/geohash.ts      decodificación de los enlaces cortos de Waze
src/maps/geocode.ts      nombre → coordenadas vía Nominatim
src/shareLink.ts         lectura del payload que manda la extensión
src/openInApp.ts         apertura con fallback a web
plugins/                 config plugin que quita la dependencia del App Group
src/ui/                  pantalla principal
```

## Instalar en un iPhone

Sin App Group, vale un Apple ID gratuito. En Xcode (`ios/MapsConverter.xcworkspace`),
en *Signing & Capabilities* de **los dos targets** (`MapsConverter` y
`MapsConverterShare`), marca *Automatically manage signing* y elige tu equipo.
Luego, con el móvil conectado:

```sh
npx expo run:ios --device --configuration Release
```

`Release` empaqueta el JS dentro de la app, así que no depende de Metro. La
primera vez hay que confiar en el certificado en *Ajustes → General → VPN y
gestión de dispositivos*. Firmando gratis **la app caduca a los 7 días** y hay
que repetir el comando.

## Limitaciones conocidas

- Al compartir siempre se pasa por la app anfitriona (limitación de iOS), así
  que se ve un parpadeo de Maps Converter antes de llegar al destino.
- Los enlaces cortos de Google necesitan conexión para resolverse, y por ese
  camino Google sólo da el nombre del sitio: las coordenadas salen de
  geocodificar, con la precisión que tenga OpenStreetMap. Con enlaces que ya
  traen coordenadas (Apple Maps, Waze, `geo:`, `/maps/place/` de escritorio) el
  pin viene del propio enlace y es exacto.
- El simulador de iOS de esta máquina no alcanza los dominios de Google
  (`example.com` responde, `www.google.com` no), así que la expansión de enlaces
  cortos sólo se puede probar en un dispositivo real.
- Android está declarado en la configuración pero no probado.
