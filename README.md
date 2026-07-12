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
- Movimientos de transferencia con origen y destino.
- Guardado con resumen emergente del movimiento.

### Resumen

- Selector de año y mes con dos desplegables al 50% del ancho.
- Situación del mes con desglose por ingresos, gastos e inversión.
- Gráficas circulares y barras.
- Resumen de dinero, banco e invertido.
- Total contable sin realizar ganancias.

### Movimientos

- Vista jerárquica por años, meses y movimientos.
- Interruptor entre realizados y futuros.
- Tabla con orden, filtros y detalle editable.
- Modo edición para seleccionar y borrar varias filas a la vez.
- En futuros se muestra también la cuenta.

### Inversiones

- Panel general de inversión y objetivos.
- Desglose por Bolsa, Fondos y Cartera.
- Edición de posiciones.
- En edición manual solo se actualiza la cantidad.
- Detalle por inversión con gráfica y tabla.

### Ajustes

- Conmutador de tema claro/oscuro.
- Configuración de Apps Script.
- Configuración del ID de Google Sheet.
- Nombres de las hojas de movimientos, futuros, inversiones, bancos y datos.
- Selector de modo de lectura.

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
- Soporte para lectura desde Apps Script o CSV público.

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

### Hoja `Datos`

| TIPO | CONCEPTO |

De aquí salen los desplegables del formulario. Si la hoja no está disponible, la app usa valores por defecto.

## Cálculos principales

- Ingresos: movimientos de tipo `Ingreso` y `Efectivo` positivo.
- Gastos: movimientos de tipo `Gasto` y `Efectivo` negativo.
- Inversión: movimientos de tipo `Inversión`.
- Balance mensual: ingresos menos gastos menos inversión.
- Banco estimado: banco inicial más movimientos y ajustes.
- Dinero total sin ganancias realizadas: banco estimado más inversión histórica.
- Resumen por tipo de inversión: Bolsa, Fondos y Cartera.

## Caché y sincronización

La app guarda en `localStorage`:

- la última copia descargada de Sheets;
- cambios pendientes de guardar;
- el tema seleccionado.

Cuando entras, usa la caché si está disponible. Si la caché sigue vigente, la pantalla carga rápido y luego se actualiza solo si hace falta. Al guardar movimientos, bancos o inversiones, la copia local se actualiza también para que la interfaz no dependa de recargar toda la hoja.

## Apps Script

El archivo `apps-script.gs` actúa como puente con Google Sheets:

- lee movimientos, futuros, inversiones, bancos, objetivos y datos;
- mueve automáticamente a realizados los futuros vencidos;
- guarda movimientos nuevos;
- actualiza y borra movimientos;
- guarda bancos;
- guarda inversiones;
- guarda objetivos.

## Modo lectura

Hay dos opciones:

- `Apps Script`: recomendado para leer y escribir.
- `CSV público`: útil solo para lectura.

En modo CSV público no podrás guardar cambios en la hoja.

## Configuración rápida

1. Abre tu Google Sheet.
2. Ve a `Extensiones > Apps Script`.
3. Pega el contenido de `apps-script.gs`.
4. Opcionalmente, define tu propio `APP_TOKEN`.
5. Despliega como `Aplicación web`.
6. Copia la URL `/exec`.
7. Abre la app, entra en `Ajustes`, pega la URL y guarda.

## Publicación

La app está pensada para GitHub Pages o cualquier hosting estático.

1. Sube `index.html`, `styles.css`, `app.js` y `apps-script.gs`.
2. No subas archivos locales sensibles.
3. Publica la web estática.
4. Conecta la URL de Apps Script desde Ajustes.

## Deshacer envíos de hoy

En `Ajustes > Conexión`, sobre la lista de envíos correctos del día, hay un botón **Deshacer** que abre una ventana con el resumen de cada operación enviada hoy. Desde ahí puedes revertir las altas de movimiento, las altas de movimiento futuro y las transferencias (se encola la operación inversa y se sincroniza con Sheets). El resto de operaciones se muestran con su detalle e indican cómo revertirlas manualmente.

## Robustez

- Las lecturas (JSONP) y escrituras (POST) tienen timeout: una petición colgada ya no bloquea la cola ni la interfaz, se reintenta sola.
- Si `localStorage` se llena, la caché se poda de forma automática y se avisa, en vez de fallar en silencio.
- Cada vista se renderiza de forma aislada: un dato inesperado no rompe la pantalla completa.
- Service worker con app-shell: la app abre sin conexión y es instalable como PWA. Los datos en vivo (Apps Script) nunca se cachean.
- Versión de librerías de CDN fijada para que un cambio externo no rompa la app.

## Desarrollo y calidad

Requisitos: Node 18+.

```bash
npm install     # dependencias de desarrollo (ESLint)
npm run check   # comprobación de sintaxis de app.js y sw.js
npm test        # tests de las funciones de cálculo (node --test)
npm run lint    # ESLint sobre los archivos nuevos
npm run verify  # check + test
```

Los tests cargan el `app.js` real en un contexto aislado (`node:vm`) y verifican las funciones puras de dinero (parseo de importes, redondeo, clasificación de movimientos, fechas, etiquetas y la lógica de deshacer) sin necesidad de navegador. La CI de GitHub Actions ejecuta `check`, `test` y `lint` en cada push y pull request.

## Notas

- La interfaz está optimizada para móvil.
- Los toasts se cierran solos tras un momento.
- Los diálogos con información detallada se cierran con la `X`.
- Las posiciones de inversión se editan desde su propia tabla.
- Los movimientos futuros conservan la cuenta para poder revisar y editar.
