# MoneyManagement

Aplicación web estática para gestionar finanzas personales con Google Sheets como fuente de datos.

## Qué hace

MoneyManagement permite:

- Registrar movimientos puntuales y periódicos.
- Separar movimientos realizados y futuros.
- Ver resúmenes mensuales con gráficas y tablas.
- Consultar bancos, dinero e inversiones.
- Editar movimientos, cuentas e inversiones desde la propia interfaz.
- Trabajar con tema claro u oscuro.
- Guardar en caché los datos para abrir la app más rápido.

## Estructura

- `index.html`: interfaz principal.
- `styles.css`: tema visual y responsive.
- `app.js`: lógica de la app, cálculos, gráficas, caché y sincronización.
- `apps-script.gs`: backend de Google Apps Script.
- `README.md`: documentación del proyecto.

## Pantallas

### Registrar

- Formulario para crear un movimiento.
- Modo puntual y modo periódico.
- Tipo, concepto, descripción, cuenta e importe.
- El concepto solo aparece en los gastos, que son los que llevan presupuesto. En
  ingreso e inversión se pide únicamente la descripción: es lo que identifica el
  movimiento y, en inversión, lo que decide a qué grupo de la cartera va el dinero.
- Movimientos de transferencia con origen y destino.
- Guardado con resumen emergente del movimiento.

### Resumen

- Selector de año y mes con dos desplegables al 50% del ancho.
- Situación del mes con desglose por ingresos, gastos e inversión. Abre en `Gastos`, con
  el presupuesto de cada categoría; el interruptor cambia a la gráfica de siempre.
- Gráficas circulares y barras.
- Resumen de dinero, banco e invertido.
- Total contable sin realizar ganancias.

### Movimientos

- Vista jerárquica por años, meses y movimientos.
- Interruptor entre realizados y futuros.
- Tabla con orden, filtros y detalle editable.
- Modo edición para seleccionar y borrar varias filas a la vez. En futuros el borrado es
  directo: el dinero aún no se ha movido, así que no se pregunta por cuenta.
- En futuros se muestra también la cuenta.

### Inversiones

- Panel general de inversión y objetivos.
- Desglose por las categorías de inversión configuradas en la hoja.
- Edición de posiciones.
- En edición manual solo se actualiza la cantidad.
- Detalle por inversión con gráfica y tabla.
- En `Objetivos`, la tarjeta `Composición` con el reparto que quieres tener.

#### Objetivos de composición

Dice cómo quieres tener repartida la cartera y cuánto te falta meter en cada sitio para
llegar a ese reparto. Tiene dos niveles: los grupos de inversión y, al pulsar en un grupo,
las posiciones que hay dentro.

- El peso de cada grupo se edita con el lápiz de la tarjeta, en dos columnas: numerador
  (`Num`) y denominador (`Den`). El denominador es 100 si lo dejas vacío, así que escribir
  `20` es un 20 %, y `1` sobre `9` es un noveno. Los pesos se normalizan hasta el 100 %.
- Un peso **vacío** deja ese grupo fuera del reparto: no sale en la tarjeta y su dinero no
  cuenta para el total. Un **0** sí cuenta, y significa "no quiero tener nada aquí".
- El dinero objetivo se fija una sola vez, arriba. Si un grupo es el 20 % de 18.000 €, su
  objetivo son 3.600 € y ese es el importe que se reparte entre sus posiciones.
- Si dejas el objetivo total vacío, se calcula el mínimo con el que se cuadra la
  composición sin vender nada.
- Cada grupo se compara con lo invertido cuando esa cifra existe y con su valor cuando no.
  Las posiciones se comparan siempre con su valor, que es el único dato que hay por
  posición; cuando las dos cifras no coinciden, el detalle del grupo lo dice.
- Los pesos se guardan en este navegador y también en la hoja `Objetivos`, así que
  sobreviven a reinstalar la app o vaciar la caché.

### Ajustes

- Conmutador de tema claro/oscuro.
- Configuración de Apps Script.
- Configuración del ID de Google Sheet.
- Nombres de las hojas de movimientos, futuros, inversiones, bancos y datos.

## Funcionalidades actuales

- Botones inferiores repartidos en cinco secciones.
- Popups de resumen en tarjetas.
- Toasts automáticos para avisos breves.
- Botón de guardar con estado de carga y confirmación.
- Cierre manual con `X` en los diálogos.
- Tablas y ventanas adaptadas al tema activo.
- Cache local con copia completa de los datos.
- Cola de cambios pendientes para inversiones y bancos.
- Sincronización con Sheets sin descargar más de lo necesario cuando no hace falta.

## Temas y colores

La app usa un esquema basado en:

- blancos, negros y escalas de grises;
- verde como color principal de interfaz;
- verde más oscuro para estados activos o pulsados;
- rojos granate o rojos claros para importes negativos o dinero.

Las gráficas usan sus propias paletas fijas de colores para mantener consistencia.

## Modelo esperado en Google Sheets

### Hoja `Control Finanzas`

| FECHA | AÑO | MES | DÍA | TIPO | CONCEPTO | DESCRIPCION | IMPORTE | CUENTA |

La app escribe:

- `FECHA`
- `TIPO`
- `CONCEPTO`
- `DESCRIPCION`
- `IMPORTE`
- `CUENTA` cuando aplica

El Apps Script rellena las fórmulas de año, mes y día.

### Hoja `Movimientos futuros`

| FECHA | AÑO | MES | DÍA | TIPO | CONCEPTO | DESCRIPCION | IMPORTE | CUENTA |

Aquí se guardan los movimientos programados que todavía no han vencido.

### Hoja `Inversiones`

| DATA | NOMBRE | TIPO | CANTIDAD | VALOR | VALOR TOTAL |

La app permite editar sobre todo la cantidad. El precio y el total se recalculan o gestionan desde Sheets según tu flujo.

### Hoja `Bancos`

| CUENTA | DINERO |

Sirve para el desglose de saldo por cuenta y para la evolución de bancos.

### Hoja `Objetivos`

| Tiempo | Valor |

Pares clave/valor. Las cuatro primeras filas son los objetivos de siempre (`Gasto
mensual`, `Inversión mensual`, `Inversión anual`, `Inversión total`), con un número.

Debajo van los ajustes de la app, con un JSON en la columna `Valor`:

| Clave | Qué guarda |
|---|---|
| `budgets` | Presupuesto mensual de cada categoría de gasto |
| `investmentComposition` | Pesos de la composición objetivo de la cartera |
| `emergencyFund` | Qué categorías de inversión cuentan para el fondo de emergencia |

Las dos lecturas conviven: el lector de objetivos ignora las claves que no reconoce y el
de ajustes solo mira las suyas. Guardar por un lado no pisa lo del otro.

### Hoja `Datos`

| TIPO | CONCEPTO |

De aquí salen los desplegables del formulario. Si la hoja no está disponible, la app usa valores por defecto.

Los conceptos son seis: `Vivienda`, `Alimentación`, `Ocio y social`, `Personal`,
`Formación` y `Otros`. El histórico conserva los nombres antiguos (`Supermercado`,
`Piso`, `Comida`…) y la app los traduce al leer, así que no hay que tocar la hoja: se
va actualizando sola cuando editas un movimiento.

## Cálculos principales

- Ingresos: movimientos de tipo `Ingreso` y `Efectivo` positivo.
- Gastos: movimientos de tipo `Gasto` y `Efectivo` negativo. Un `Efectivo` o un `Retiro`
  positivo es dinero que entra y no cuenta como gasto.
- Inversión: movimientos de tipo `Inversión`. La categoría de la cartera sale de la
  descripción (`Bolsa`, `Fondos`…), no del concepto.
- Balance mensual: ingresos menos gastos menos inversión.
- Banco estimado: banco inicial más movimientos y ajustes.
- Dinero total sin ganancias realizadas: banco estimado más inversión histórica.
- Resumen por las categorías de inversión configuradas en la hoja.

## Caché y sincronización

La app guarda en `localStorage`:

- la última copia descargada de Sheets;
- cambios pendientes de guardar;
- el tema seleccionado;
- los objetivos de composición de la cartera;
- el presupuesto mensual por categoría.

Los tres últimos son además copia de lo que hay en la hoja `Objetivos`: al entrar mandan
los de Sheets, y lo que guardas aquí se sube.

Cuando entras, usa la caché si está disponible. Si la caché sigue vigente, la pantalla carga rápido y luego se actualiza solo si hace falta. Al guardar movimientos, bancos o inversiones, la copia local se actualiza también para que la interfaz no dependa de recargar toda la hoja.

Una descarga que se corta (un corte de red, cerrar la app) deja anotado en la caché qué secciones faltaban y por qué página iba; el siguiente arranque la retoma por ahí en vez de empezar de cero o quedarse con datos parciales.

Al guardar, solo se vuelven a serializar las secciones que han cambiado, y durante una descarga paginada la escritura en `localStorage` se espacia: guardar en cada página reescribía el histórico entero, de forma síncrona, tantas veces como páginas hubiera.

## Apps Script

El archivo `apps-script.gs` actúa como puente con Google Sheets:

- lee movimientos, futuros, inversiones, bancos, objetivos y datos;
- mueve automáticamente a realizados los futuros vencidos;
- guarda movimientos nuevos;
- actualiza y borra movimientos;
- guarda bancos;
- guarda objetivos y los ajustes de la app (presupuesto, composición y fondo);
- actualiza cotizaciones desde Yahoo;
- manda el aviso diario de inversión por Telegram.

## Aviso diario por Telegram (opcional)

El backend puede mandarte un resumen diario de la variación de tus inversiones.

1. En `apps-script.gs`, rellena `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
   Para saber tu chat id, escribe a tu bot y ejecuta `getTelegramChatId` desde el
   editor de Apps Script: deja el id en el registro.
2. Ejecuta `setupDailyMoneyManagementNotifications` una vez desde el editor. Crea
   un disparador diario a la hora de `DAILY_NOTIFICATION_HOUR` (por defecto, las 22).

Si dejas el token vacío, no se manda nada y el resto de la app funciona igual.

## Configuración rápida

1. Abre tu Google Sheet.
2. Ve a `Extensiones > Apps Script`.
3. Pega el contenido de `apps-script.gs`.
4. **Define tu propio `APP_TOKEN`** (obligatorio: es la única protección del endpoint).
5. Despliega como `Aplicación web`, ejecutada como **tú** y con acceso para
   **cualquiera**. Es imprescindible para que la PWA pueda leerla desde un móvil
   sin una sesión de Google concreta; el `APP_TOKEN` sigue protegiendo los datos.
6. Copia la URL publicada que termina en `/exec` (no la URL de prueba `/dev`).
7. Abre la app, entra en `Ajustes`, pega la URL y **el mismo token**, y guarda.

Desde el navegador del móvil, abrir esa URL `/exec` debe devolver una respuesta
de Apps Script (aunque indique que falta el token). Si redirige a inicio de sesión
o muestra una página de permisos, revisa el acceso del despliegue antes de usarla
en la app.

> El token es obligatorio. Sin él, cualquiera que conozca tu URL `/exec` podría
> leer y modificar tus finanzas. Si dejas `APP_TOKEN` vacío, el backend rechaza
> todas las peticiones.

## Publicación

La app está pensada para GitHub Pages o cualquier hosting estático.

1. Sube `index.html`, `styles.css`, `app.js` y `apps-script.gs`.
2. No subas archivos locales sensibles.
3. Publica la web estática.
4. Conecta la URL de Apps Script desde Ajustes.

## Si un cambio se queda sin enviar

En `Ajustes > Conexión`, la tabla de peticiones pendientes muestra cada operación con su
estado y un botón **Reintentar ahora**. Sirve también para las que quedaron detenidas tras
agotar los reintentos: las reactiva y las vuelve a enviar.

Si la app y Google Sheets se han desincronizado, fuerza una descarga completa desde
`Ajustes`: mientras no queden operaciones pendientes de enviar, se vuelven a bajar también
las secciones con cambios locales.

## Deshacer envíos de hoy

En `Ajustes > Conexión`, sobre la lista de envíos correctos del día, hay un botón **Deshacer** que abre una ventana con el resumen de cada operación enviada hoy. Desde ahí puedes revertir las altas de movimiento, las altas de movimiento futuro y las transferencias (se encola la operación inversa y se sincroniza con Sheets). El resto de operaciones se muestran con su detalle e indican cómo revertirlas manualmente.

## Robustez

- El endpoint exige token: sin `APP_TOKEN` configurado no se sirve ninguna petición.
- Una sola vía de escritura: todo cambio pasa por la cola de operaciones y viaja por POST
  con su `clientOpId`, que es lo que hace que un reenvío no se aplique dos veces. `doGet`
  solo lee (más mover futuros vencidos, actualizar precios y mandar el aviso diario).
- Las mutaciones que llegan por GET (mover futuros vencidos, inversiones, precios) se serializan con el script lock: dos pestañas a la vez ya no duplican movimientos ni aplican dos veces los ajustes de saldo.
- Un choque transitorio con el bloqueo se reintenta solo en vez de detener la operación con un error definitivo.
- Las transferencias periódicas no escriben en `CUENTA`: el par de cuentas viaja en `DESCRIPCION`, de donde ya lo leen tanto la app como el backend. Así un desplegable de validación en esa columna no puede rechazarlas (era la causa de que no llegaran a guardarse nunca).
- El resto de escrituras toleran las reglas de validación de la hoja: si una regla rechaza el valor de una fila nueva, se limpia la validación de esa fila y se reintenta.
- Las transferencias llevan identificador propio: un reenvío no mueve el dinero dos veces, aunque el registro de operaciones confirmadas se haya podado.
- Las altas periódicas viajan en un solo envío por lote (hasta 100 operaciones), aplicadas bajo un único bloqueo del servidor: una recurrencia de 52 fechas es una petición, no 52.
- Los importes ilegibles se rechazan con aviso en vez de convertirse en `0 €` en silencio; los miles en formato español (`1.234`) se interpretan correctamente.
- Las recurrencias están acotadas (máximo 366 fechas) y piden confirmación por encima de 50 movimientos.
- La edición y el borrado de movimientos localizan la fila por identificador estable: actualizar los datos mientras tienes un movimiento abierto ya no edita el equivocado.
- Borrar un movimiento futuro no toca ningún banco ni pregunta por cuenta: ese dinero no ha salido todavía, el saldo solo se ajusta cuando el movimiento vence. Y el botón de borrar en lote ya no se queda en `Borrando`: el borrado va a la cola, así que vuelve a estar disponible al instante.
- Si un CDN no carga, la app arranca igual (sin iconos ni gráficas) en vez de quedarse en blanco.
- Lecturas y escrituras van por `fetch` con CORS y se cancelan con `AbortController` al agotar su tiempo: una petición colgada ya no bloquea la cola ni la interfaz.
- La confirmación de un guardado llega en la respuesta del propio POST, no sondeando después: un cambio se confirma en un par de segundos.
- Los fallos se clasifican por su código real (HTTP o `errorCode`): lo transitorio se reintenta solo con espera creciente, y lo que no va a mejorar (token, hoja inexistente, datos inválidos) se detiene enseguida enseñando el motivo.
- Si `localStorage` se llena, la caché se poda de forma automática y se avisa, en vez de fallar en silencio.
- Cada vista se renderiza de forma aislada: un dato inesperado no rompe la pantalla completa.
- Service worker con app-shell: la app abre sin conexión y es instalable como PWA. Los datos en vivo (Apps Script) nunca se cachean.
- Versión de librerías de CDN fijada para que un cambio externo no rompa la app.

## Desarrollo y calidad

Requisitos: Node 18+.

```bash
npm install     # dependencias de desarrollo (ESLint)
npm run check   # comprobación de sintaxis de app.js, sw.js y apps-script.gs
npm test        # tests de las funciones de cálculo (node --test)
npm run lint    # ESLint sobre app.js, sw.js, apps-script.gs, tests y scripts
npm run verify  # check + check:versions + test
```

Los tests cargan el `app.js` real en un contexto aislado (`node:vm`) y verifican las funciones puras de dinero (parseo de importes, redondeo, clasificación de movimientos, fechas, etiquetas y la lógica de deshacer) sin necesidad de navegador. La CI de GitHub Actions ejecuta `check`, `test` y `lint` en cada push y pull request.

## Notas

- La interfaz está optimizada para móvil.
- Los toasts se cierran solos tras un momento.
- Los diálogos con información detallada se cierran con la `X`.
- Las posiciones de inversión se editan desde su propia tabla.
- Los movimientos futuros conservan la cuenta para poder revisar y editar.
