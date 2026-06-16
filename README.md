# MoneyManagement

App estatica para GitHub Pages que usa Google Sheets como base de datos de finanzas personales.

## Estructura

- `index.html`: entrada principal de la app.
- `styles.css`: estilos visuales y responsive.
- `app.js`: logica de interfaz, calculos, graficos y conexion con Google Sheets.
- `apps-script.gs`: codigo que se pega en Google Apps Script.
- `.gitignore`: evita subir Excel u otros archivos locales sensibles.

## Pantallas

- `Enviar gasto`: pagina principal para insertar filas en `Control Finanzas`.
- `Resumen`: calcula en la web lo que antes hacia `Resumen Finanzas`, con selector de mes.
- `Movimientos`: carga toda la hoja `Control Finanzas` y permite filtrar, buscar y exportar CSV.
- `Inversiones`: revisa posiciones, asignacion por tipo, P/L y permite modificar filas de `Inversiones`.
- `Ajustes`: conexion con Google Sheets.

## Modelo esperado en Google Sheets

Hoja `Control Finanzas`:

| FECHA | ANO | MES | DIA | TIPO | CONCEPTO | DESCRIPCION | IMPORTE |

La app rellena:

- `FECHA`
- `TIPO`
- `CONCEPTO`
- `DESCRIPCION`
- `IMPORTE`

Y el Apps Script anade formulas para `ANO`, `MES` y `DIA`.

Hoja `Datos`:

| TIPO | CONCEPTO |

Las opciones de los desplegables salen de esta hoja. Si no se puede cargar, la app usa estas opciones por defecto:

- Tipos: `Efectivo`, `Gasto`, `Ingreso`, `Retiro`, `Inversion`
- Conceptos: `Comida`, `Cuidado personal`, `Deporte`, `Fiesta`, `Inversion`, `Ocio`, `Otros`, `Piso`, `Supermercado`, `Universidad`, `Viajes`

Hoja `Inversiones`:

| DATA | NOMBRE | TIPO | CANTIDAD | VALOR | VALOR TOTAL |

## Como se calcula el resumen

La app replica la logica principal de `Resumen Finanzas`:

- Ingresos mes: `Ingreso` + `Efectivo` positivo.
- Gastos mes: `Gasto` + `Efectivo` negativo.
- Inversion mes: movimientos de tipo `Inversion`.
- Balance mes: ingresos - gastos - inversion.
- Banco estimado: banco inicial + ingresos + gastos - retiros + inversiones hasta hoy.
- Inversion por tipo: usa la `DESCRIPCION` de los movimientos de inversion (`Bolsa`, `Fondos`, `Cartera`).
- Valor actual: suma `VALOR TOTAL` en `Inversiones` por tipo.

## Conexion recomendada

No subas `ControlFinanzas.xlsx` a GitHub si contiene datos reales. Lo recomendable es:

1. Mantener los datos en Google Sheets.
2. Subir a GitHub solo la web (`index.html`, `styles.css`, `app.js`) y el script.
3. Publicar la web con GitHub Pages.
4. Usar Google Apps Script como puente para leer y escribir.

## Configurar Apps Script

1. Abre tu Google Sheet.
2. Ve a `Extensiones > Apps Script`.
3. Pega el contenido de `apps-script.gs`.
4. Opcional pero recomendable: cambia `const APP_TOKEN = '';` por una clave tuya, por ejemplo `const APP_TOKEN = 'mi-clave-larga';`.
5. Pulsa `Implementar > Nueva implementacion`.
6. Tipo: `Aplicacion web`.
7. Ejecutar como: tu usuario.
8. Acceso: `Cualquier usuario con el enlace`.
9. Copia la URL terminada en `/exec`.
10. Abre la app, entra en `Ajustes`, pega esa URL y el mismo token, y guarda.

Con Apps Script la app puede:

- Leer toda la hoja `Control Finanzas`.
- Leer `Datos` para los desplegables.
- Leer `Inversiones`.
- Insertar nuevos movimientos.
- Guardar cambios de posiciones de inversion.

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub.
2. Comprueba que `ControlFinanzas.xlsx` no se sube. El `.gitignore` ya bloquea `*.xlsx`.
3. En GitHub, ve a `Settings > Pages`.
4. Source: `Deploy from a branch`.
5. Branch: `main`, carpeta `/root`.
6. Abre la URL de GitHub Pages.

## Modo CSV publico

Tambien existe un modo de lectura por CSV publico usando el ID del Google Sheet, pero no sirve para escribir. Para enviar gastos o modificar inversiones necesitas Apps Script.
