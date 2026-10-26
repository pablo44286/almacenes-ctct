// =============================================================
// Historial semanal de KPI de almacén — agregar al proyecto Apps Script
// "AlmaceneCTCT" (archivo Código.gs). Lo usa el botón "Carga semanal SAP".
//
// Pasos:
//   1. Pegar este bloque al final de Código.gs.
//   2. En doGet, dentro del switch, agregar:
//        case 'getHistorialKPI': data = getHistorialKPI(); break;
//   3. En doPost, dentro del switch, agregar:
//        case 'guardarSnapshotKPI': data = guardarSnapshotKPI(body.snapshot, body.usuario); break;
//   4. Implementar > Gestionar implementaciones > editar (lápiz) la implementación
//      actual > Versión: "Nueva versión" > Implementar. Así la URL no cambia.
// La hoja "Historial KPI" se crea sola la primera vez.
// =============================================================

const SHEET_HISTORIAL_KPI = 'Historial KPI';

// Orden de columnas de la hoja. Agregar campos nuevos siempre al final.
const HEADERS_HISTORIAL_KPI = [
  'semana', 'fecha', 'usuario', 'archivo', 'materiales', 'materiales_con_stock', 'valor_libre_util_ars',
  'kpi1_pct', 'kpi1_validos', 'sin_ubicacion', 'zona_con_nombre', 'variante_codigo',
  'kpi2_materiales', 'kpi2_valor_ars', 'kpi3_grupos', 'kpi4_grupos',
  'cantidades_actualizadas', 'ubicaciones_actualizadas'
];

function hojaHistorialKPI() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_HISTORIAL_KPI);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_HISTORIAL_KPI);
    sheet.appendRow(HEADERS_HISTORIAL_KPI);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getHistorialKPI() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_HISTORIAL_KPI);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0].map(function(h) { return String(h); });
  return data.slice(1).filter(function(r) { return r[0] !== ''; }).map(function(r) {
    const obj = {};
    headers.forEach(function(h, i) {
      obj[h] = (r[i] instanceof Date)
        ? Utilities.formatDate(r[i], 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm')
        : r[i];
    });
    return obj;
  });
}

// Guarda (o reemplaza, si ya hay una fila de la misma semana) la foto de KPI.
function guardarSnapshotKPI(snapshot, usuario) {
  if (!snapshot || !snapshot.semana) throw new Error('Snapshot sin semana');
  const sheet = hojaHistorialKPI();
  const fila = HEADERS_HISTORIAL_KPI.map(function(h) {
    if (h === 'fecha') return new Date();
    if (h === 'usuario') return usuario || 'sistema';
    const v = snapshot[h];
    return v === undefined || v === null ? '' : v;
  });

  const semanas = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function(r) { return String(r[0]); })
    : [];
  const idx = semanas.indexOf(String(snapshot.semana));
  if (idx >= 0) {
    sheet.getRange(idx + 2, 1, 1, fila.length).setValues([fila]);
  } else {
    sheet.appendRow(fila);
  }

  audit(usuario, 'SNAPSHOT_KPI', '', '', snapshot.semana + ' · KPI1 ' + snapshot.kpi1_pct + '%', '');
  return { semana: snapshot.semana, reemplazada: idx >= 0 };
}
