// ============ ESTADO ============
const state = {
  ventas: [],
  gastos: [],
  deudas: [],
  productos: [],
  caja: [],
};

// ============ HELPERS ============
const fmt = (n) => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().split('T')[0];
const dateObj = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isSameDay = (a, b) => a.toDateString() === b.toDateString();
const isSameMonth = (a, b) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const startOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

// ============ CARGA INICIAL ============
async function cargarDatos() {
  state.ventas = await dbGetAll('ventas');
  state.gastos = await dbGetAll('gastos');
  state.deudas = await dbGetAll('deudas');
  state.productos = await dbGetAll('productos');
  state.caja = await dbGetAll('caja');
}

async function recargarTodo() {
  await cargarDatos();
  renderAll();
  await cargarProductosEnSelect();
}

// ============ NAVEGACIÓN ============
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + item.dataset.view).classList.remove('hidden');
    if (item.dataset.view === 'calendario') renderCalendar();
    if (item.dataset.view === 'caja') renderCaja();
  });
});

// ============ VALIDACIONES ============
function validarVenta(fecha, desc, monto) {
  const hoy = todayStr();
  if (!fecha) return 'La fecha es obligatoria.';
  if (fecha > hoy) return 'La fecha no puede ser futura.';
  if (!desc.trim()) return 'La descripción es obligatoria.';
  const m = parseFloat(monto);
  if (isNaN(m) || m <= 0) return 'El monto debe ser mayor a 0.';
  if (m > 99999999) return 'El monto excede el límite permitido.';
  return null;
}

// ============ VENTAS ============
document.getElementById('ventaFecha').value = todayStr();

document.getElementById('formVenta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = document.getElementById('ventaFecha').value;
  const desc = document.getElementById('ventaDesc').value.trim();
  const monto = parseFloat(document.getElementById('ventaMonto').value);
  const metodo = document.getElementById('ventaMetodo').value;
  const productoId = document.getElementById('ventaProducto').value;

  const error = validarVenta(fecha, desc, monto);
  if (error) { alert(error); return; }

  await dbAdd('ventas', { fecha, desc, monto, metodo, productoId: productoId ? Number(productoId) : null });

  if (productoId) {
    const prod = state.productos.find(p => p.id === Number(productoId));
    if (prod) {
      prod.stock -= 1;
      await dbPut('productos', prod);
    }
  }

  await limpiarDraft('formVenta');
  e.target.reset();
  document.getElementById('ventaFecha').value = todayStr();
  await recargarTodo();
});

async function cargarProductosEnSelect() {
  const select = document.getElementById('ventaProducto');
  if (!select) return;
  select.innerHTML = '<option value="">— Venta libre —</option>';
  state.productos.forEach(p => {
    select.innerHTML += `<option value="${p.id}" data-precio="${p.precio}">${p.nombre} (stock: ${p.stock})</option>`;
  });
}

document.getElementById('ventaProducto').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.dataset.precio) {
    document.getElementById('ventaMonto').value = opt.dataset.precio;
    document.getElementById('ventaDesc').value = opt.textContent.split(' (')[0];
  }
});

// ============ GASTOS ============
document.getElementById('gastoFecha').value = todayStr();

document.getElementById('formGasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = document.getElementById('gastoFecha').value;
  const desc = document.getElementById('gastoDesc').value.trim();
  const monto = parseFloat(document.getElementById('gastoMonto').value);

  const error = validarVenta(fecha, desc, monto);
  if (error) { alert(error); return; }

  await dbAdd('gastos', { fecha, desc, monto });
  await limpiarDraft('formGasto');
  e.target.reset();
  document.getElementById('gastoFecha').value = todayStr();
  await recargarTodo();
});

// ============ DEUDAS ============
document.getElementById('deudaFecha').value = todayStr();

document.getElementById('formDeuda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = document.getElementById('deudaFecha').value;
  const acreedor = document.getElementById('deudaAcreedor').value.trim();
  const monto = parseFloat(document.getElementById('deudaMonto').value);

  if (!fecha || !acreedor || isNaN(monto) || monto <= 0) {
    alert('Completá todos los campos correctamente.');
    return;
  }

  await dbAdd('deudas', { fecha, acreedor, monto, pagado: 0 });
  await limpiarDraft('formDeuda');
  e.target.reset();
  document.getElementById('deudaFecha').value = todayStr();
  await recargarTodo();
});

// ============ INVENTARIO ============
document.getElementById('formProducto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('prodNombre').value.trim();
  const costo = parseFloat(document.getElementById('prodCosto').value);
  const precio = parseFloat(document.getElementById('prodPrecio').value);
  const stock = parseInt(document.getElementById('prodStock').value);
  const minimo = parseInt(document.getElementById('prodMin').value) || 5;

  if (!nombre || isNaN(costo) || isNaN(precio) || isNaN(stock)) {
    alert('Completá todos los campos correctamente.');
    return;
  }

  await dbAdd('productos', { nombre, costo, precio, stock, minimo });
  await limpiarDraft('formProducto');
  e.target.reset();
  document.getElementById('prodMin').value = 5;
  await recargarTodo();
});

// ============ ELIMINAR ============
const eliminar = async (tipo, id) => {
  if (!confirm('¿Eliminar este registro?')) return;
  await dbDelete(tipo, id);
  await recargarTodo();
};

const eliminarProducto = async (id) => {
  if (!confirm('¿Eliminar este producto?')) return;
  await dbDelete('productos', id);
  await recargarTodo();
};

// ============ PAGAR DEUDA ============
const pagarDeuda = async (id) => {
  const d = state.deudas.find(x => x.id === id);
  if (!d) return;
  const saldo = d.monto - (d.pagado || 0);
  const monto = parseFloat(prompt(`Saldo actual: ${fmt(saldo)}\n¿Cuánto pagás?`, saldo));
  if (isNaN(monto) || monto <= 0) return;
  d.pagado = Math.min(d.monto, (d.pagado || 0) + monto);
  await dbPut('deudas', d);
  await recargarTodo();
};

// ============ RENDER TABLAS ============
function renderVentas() {
  const desde = document.getElementById('filtroVentasDesde')?.value;
  const hasta = document.getElementById('filtroVentasHasta')?.value;
  const texto = (document.getElementById('filtroVentasTexto')?.value || '').toLowerCase();

  let lista = [...state.ventas];
  if (desde) lista = lista.filter(v => v.fecha >= desde);
  if (hasta) lista = lista.filter(v => v.fecha <= hasta);
  if (texto) lista = lista.filter(v => v.desc.toLowerCase().includes(texto));

  const tbody = document.getElementById('tbodyVentas');
  tbody.innerHTML = '';
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha)).forEach(v => {
    tbody.innerHTML += `
      <tr>
        <td>${v.fecha}</td>
        <td>${v.desc}</td>
        <td>${v.metodo || 'efectivo'}</td>
        <td>${fmt(v.monto)}</td>
        <td>
          <button class="btn-delete" onclick="imprimirTicketPorId(${v.id})" title="Imprimir"><i class="fa-solid fa-print"></i></button>
          <button class="btn-delete" onclick="eliminar('ventas', ${v.id})"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
  });
  document.getElementById('totalVentasTabla').textContent = fmt(lista.reduce((s, v) => s + v.monto, 0));
}

function renderGastos() {
  const desde = document.getElementById('filtroGastosDesde')?.value;
  const hasta = document.getElementById('filtroGastosHasta')?.value;
  const texto = (document.getElementById('filtroGastosTexto')?.value || '').toLowerCase();

  let lista = [...state.gastos];
  if (desde) lista = lista.filter(g => g.fecha >= desde);
  if (hasta) lista = lista.filter(g => g.fecha <= hasta);
  if (texto) lista = lista.filter(g => g.desc.toLowerCase().includes(texto));

  const tbody = document.getElementById('tbodyGastos');
  tbody.innerHTML = '';
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha)).forEach(g => {
    tbody.innerHTML += `
      <tr>
        <td>${g.fecha}</td>
        <td>${g.desc}</td>
        <td>${fmt(g.monto)}</td>
        <td><button class="btn-delete" onclick="eliminar('gastos', ${g.id})"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
  });
  document.getElementById('totalGastosTabla').textContent = fmt(lista.reduce((s, g) => s + g.monto, 0));
}

function renderDeudas() {
  const tbody = document.getElementById('tbodyDeudas');
  tbody.innerHTML = '';
  state.deudas.forEach(d => {
    const saldo = d.monto - (d.pagado || 0);
    tbody.innerHTML += `
      <tr>
        <td>${d.fecha}</td>
        <td>${d.acreedor}</td>
        <td>${fmt(d.monto)}</td>
        <td>${fmt(d.pagado || 0)}</td>
        <td><strong>${fmt(saldo)}</strong></td>
        <td>
          <button class="btn-delete" onclick="pagarDeuda(${d.id})" title="Registrar pago"><i class="fa-solid fa-money-bill"></i></button>
          <button class="btn-delete" onclick="eliminar('deudas', ${d.id})"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
  });
}

function renderInventario() {
  const tbody = document.getElementById('tbodyInventario');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.productos.forEach(p => {
    const bajo = p.stock <= (p.minimo || 5);
    tbody.innerHTML += `
      <tr>
        <td>${p.nombre}</td>
        <td>${fmt(p.costo)}</td>
        <td>${fmt(p.precio)}</td>
        <td style="color:${bajo ? 'var(--magenta)' : 'inherit'};font-weight:${bajo ? '700' : '400'}">
          ${p.stock} ${bajo ? '<i class="fa-solid fa-triangle-exclamation"></i>' : ''}
        </td>
        <td>${bajo ? '<span style="color:var(--magenta);font-weight:600">Stock bajo</span>' : 'OK'}</td>
        <td><button class="btn-delete" onclick="eliminarProducto(${p.id})"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
  });
}

function renderCaja() {
  const tbody = document.getElementById('tbodyCaja');
  if (!tbody) return;
  tbody.innerHTML = '';
  const ordenadas = [...state.caja].sort((a, b) => b.fecha.localeCompare(a.fecha));
  ordenadas.forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td>${c.fecha}</td>
        <td>${fmt(c.inicial)}</td>
        <td>${fmt(c.ventasEfectivo)}</td>
        <td>${fmt(c.esperado)}</td>
        <td>${fmt(c.real)}</td>
        <td style="color:${c.diferencia === 0 ? 'inherit' : 'var(--magenta)'};font-weight:700">${fmt(c.diferencia)}</td>
      </tr>`;
  });
  const hoy = todayStr();
  const cajaHoy = state.caja.find(c => c.fecha === hoy);
  document.getElementById('cajaInicial').textContent = cajaHoy ? fmt(cajaHoy.inicial) : '$0';
  const ventasEf = calcularVentasEfectivo(hoy);
  document.getElementById('cajaVentas').textContent = fmt(ventasEf);
  document.getElementById('cajaEsperado').textContent = fmt((cajaHoy?.inicial || 0) + ventasEf);
}

// ============ DASHBOARD ============
function renderDashboard() {
  const hoy = new Date();
  const inicioSemana = startOfWeek(hoy);

  // --- Período HOY ---
  const ventasHoyArr = state.ventas.filter(v => isSameDay(dateObj(v.fecha), hoy));
  const gastosHoyArr = state.gastos.filter(g => isSameDay(dateObj(g.fecha), hoy));
  const totalHoy = ventasHoyArr.reduce((s, v) => s + v.monto, 0);
  const gastosHoy = gastosHoyArr.reduce((s, g) => s + g.monto, 0);

  // --- Período SEMANA ---
  const ventasSemArr = state.ventas.filter(v => dateObj(v.fecha) >= inicioSemana);
  const gastosSemArr = state.gastos.filter(g => dateObj(g.fecha) >= inicioSemana);
  const totalSemana = ventasSemArr.reduce((s, v) => s + v.monto, 0);
  const gastosSemana = gastosSemArr.reduce((s, g) => s + g.monto, 0);

  // --- Período MES ---
  const ventasMesArr = state.ventas.filter(v => isSameMonth(dateObj(v.fecha), hoy));
  const gastosMesArr = state.gastos.filter(g => isSameMonth(dateObj(g.fecha), hoy));
  const ventasMes = ventasMesArr.reduce((s, v) => s + v.monto, 0);
  const gastosMes = gastosMesArr.reduce((s, g) => s + g.monto, 0);

  const netoMes = ventasMes - gastosMes;
  const ahorroMes = ventasMes * 0.10;
  const deudaMes = ventasMes * 0.20;

  // --- Tarjetas superiores ---
  document.getElementById('totalHoy').textContent = fmt(totalHoy);
  document.getElementById('totalSemana').textContent = fmt(totalSemana);
  document.getElementById('totalMes').textContent = fmt(ventasMes);
  document.getElementById('netoMes').textContent = fmt(netoMes);

  document.getElementById('subHoy').textContent = `${ventasHoyArr.length} venta${ventasHoyArr.length !== 1 ? 's' : ''}`;
  document.getElementById('subSemana').textContent = `${ventasSemArr.length} venta${ventasSemArr.length !== 1 ? 's' : ''}`;
  document.getElementById('subMes').textContent = `${ventasMesArr.length} venta${ventasMesArr.length !== 1 ? 's' : ''}`;
  document.getElementById('subNeto').textContent = netoMes >= 0 ? 'Ventas − Gastos' : 'Pérdida del mes';

  // --- Fecha del header ---
  const fechaTexto = hoy.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const fechaEl = document.getElementById('fechaHoyTexto');
  if (fechaEl) fechaEl.textContent = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);

  // --- Tabla resumen por período ---
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };

  set('tablaHoyVentas', totalHoy);
  set('tablaHoyGastos', gastosHoy);
  set('tablaHoyNeto', totalHoy - gastosHoy);
  set('tablaHoyAhorro', totalHoy * 0.10);
  set('tablaHoyDeuda', totalHoy * 0.20);

  set('tablaSemVentas', totalSemana);
  set('tablaSemGastos', gastosSemana);
  set('tablaSemNeto', totalSemana - gastosSemana);
  set('tablaSemAhorro', totalSemana * 0.10);
  set('tablaSemDeuda', totalSemana * 0.20);

  set('tablaMesVentas', ventasMes);
  set('tablaMesGastos', gastosMes);
  set('tablaMesNeto', netoMes);
  set('tablaMesAhorro', ahorroMes);
  set('tablaMesDeuda', deudaMes);

  // --- Fondos con barras de progreso ---
  const ahorroTotal = state.ventas.reduce((s, v) => s + v.monto * 0.10, 0);
  const deudasTotal = state.deudas.reduce((s, d) => s + (d.monto - (d.pagado || 0)), 0);

  const elAhorroMes = document.getElementById('ahorroMes');
  const elDeudaMes = document.getElementById('deudaMes');
  const elFondoAhorro = document.getElementById('fondoAhorro');
  const elFondoDeuda = document.getElementById('fondoDeuda');
  const elAhorroTotal = document.getElementById('ahorroTotal');
  const elGastosMes = document.getElementById('gastosMes');
  const elSubAhorro = document.getElementById('subAhorro');
  const elSubDeuda = document.getElementById('subDeuda');

  if (elAhorroMes) elAhorroMes.textContent = fmt(ahorroMes);
  if (elDeudaMes) elDeudaMes.textContent = fmt(deudaMes);
  if (elFondoAhorro) elFondoAhorro.textContent = fmt(ahorroMes);
  if (elFondoDeuda) elFondoDeuda.textContent = fmt(deudaMes);
  if (elAhorroTotal) elAhorroTotal.textContent = fmt(ahorroTotal);
  if (elGastosMes) elGastosMes.textContent = fmt(gastosMes);

  if (elSubAhorro) elSubAhorro.textContent = `Ahorro acumulado total: ${fmt(ahorroTotal)}`;
  if (elSubDeuda) elSubDeuda.textContent = `Saldo total de deudas: ${fmt(deudasTotal)}`;

  const barraAhorro = document.getElementById('barraAhorro');
  if (barraAhorro) {
    const pctAhorro = ventasMes > 0 ? Math.min((ahorroMes / (ventasMes || 1)) * 100, 100) : 0;
    barraAhorro.style.width = pctAhorro + '%';
  }

  const barraDeuda = document.getElementById('barraDeuda');
  if (barraDeuda) {
    const pctDeuda = deudasTotal > 0 ? Math.min((deudaMes / deudasTotal) * 100, 100) : 0;
    barraDeuda.style.width = pctDeuda + '%';
  }

  // --- Gráfico de últimos 7 días ---
  renderWeekChart(hoy);

  // --- Resumen de gastos del mes por concepto ---
  renderGastosResumen(gastosMesArr, gastosMes);
}

function renderWeekChart(hoy) {
  const contenedor = document.getElementById('weekChart');
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    dias.push(d);
  }

  const totales = dias.map(d => {
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return state.ventas.filter(v => v.fecha === str).reduce((s, v) => s + v.monto, 0);
  });

  const max = Math.max(...totales, 1);

  dias.forEach((d, i) => {
    const valor = totales[i];
    const altura = max > 0 ? (valor / max) * 80 : 4;
    const esHoy = isSameDay(d, hoy);
    const label = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');

    contenedor.innerHTML += `
      <div class="week-day ${esHoy ? 'today' : ''}">
        <span class="week-day-value">${valor > 0 ? fmt(valor) : ''}</span>
        <div class="week-day-bar" style="height:${Math.max(altura, 4)}px"></div>
        <span class="week-day-label">${label}</span>
      </div>`;
  });
}

function renderGastosResumen(gastosArr, total) {
  const tbody = document.getElementById('tbodyGastosResumen');
  if (!tbody) return;
  tbody.innerHTML = '';

  const agrupado = {};
  gastosArr.forEach(g => {
    const key = g.desc.toLowerCase();
    if (!agrupado[key]) agrupado[key] = { desc: g.desc, monto: 0 };
    agrupado[key].monto += g.monto;
  });

  const lista = Object.values(agrupado).sort((a, b) => b.monto - a.monto);

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--gris-texto);padding:24px">Sin gastos registrados este mes</td></tr>`;
    return;
  }

  lista.forEach(g => {
    const pct = total > 0 ? (g.monto / total) * 100 : 0;
    tbody.innerHTML += `
      <tr>
        <td>${g.desc}</td>
        <td class="text-right">${fmt(g.monto)}</td>
        <td class="text-right">${pct.toFixed(1)}%</td>
      </tr>`;
  });
}

// ============ CAJA ============
function calcularVentasEfectivo(fecha) {
  return state.ventas
    .filter(v => v.fecha === fecha && (v.metodo === 'efectivo' || !v.metodo))
    .reduce((s, v) => s + v.monto, 0);
}

document.getElementById('btnCerrarCaja').addEventListener('click', async () => {
  const inicial = parseFloat(document.getElementById('inputInicial').value) || 0;
  const real = parseFloat(document.getElementById('inputReal').value) || 0;
  const hoy = todayStr();
  const ventasEfectivo = calcularVentasEfectivo(hoy);
  const esperado = inicial + ventasEfectivo;
  const diferencia = real - esperado;

  await dbPut('caja', { fecha: hoy, inicial, ventasEfectivo, real, esperado, diferencia });

  const res = document.getElementById('resultadoCaja');
  res.style.display = 'flex';
  document.getElementById('textoResultado').innerHTML = `
    Cierre registrado. Esperado: ${fmt(esperado)} — Real: ${fmt(real)} —
    Diferencia: <strong style="color:${diferencia === 0 ? 'inherit' : 'var(--magenta)'}">${fmt(diferencia)}</strong>
  `;
  await recargarTodo();
});

// ============ CALENDARIO ============
let calDate = new Date();

document.getElementById('prevMonth').addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() + 1);
  renderCalendar();
});

function renderCalendar() {
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  document.getElementById('monthLabel').textContent = calDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const primerDia = new Date(year, month, 1);
  const inicio = startOfWeek(primerDia);
  const diasEnMes = new Date(year, month + 1, 0).getDate();

  const cal = document.getElementById('calendar');
  cal.innerHTML = '';
  ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(d => {
    cal.innerHTML += `<div class="cal-day header">${d}</div>`;
  });

  const hoy = new Date();
  const offset = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1;
  const totalCeldas = Math.ceil((diasEnMes + offset) / 7) * 7;

  for (let i = 0; i < totalCeldas; i++) {
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + i);
    const diaStr = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;

    const ventasDia = state.ventas.filter(v => v.fecha === diaStr).reduce((s, v) => s + v.monto, 0);
    const gastosDia = state.gastos.filter(g => g.fecha === diaStr).reduce((s, g) => s + g.monto, 0);

    const clases = ['cal-day'];
    if (dia.getMonth() !== month) clases.push('other-month');
    if (isSameDay(dia, hoy)) clases.push('today');

    cal.innerHTML += `
      <div class="${clases.join(' ')}">
        <div class="num">${dia.getDate()}</div>
        ${ventasDia > 0 ? `<div class="venta">+ ${fmt(ventasDia)}</div>` : ''}
        ${gastosDia > 0 ? `<div class="gasto">- ${fmt(gastosDia)}</div>` : ''}
      </div>`;
  }
}

// ============ EXPORTAR / IMPORTAR ============
async function exportarRespaldo() {
  const datos = {
    ventas: await dbGetAll('ventas'),
    gastos: await dbGetAll('gastos'),
    deudas: await dbGetAll('deudas'),
    productos: await dbGetAll('productos'),
    caja: await dbGetAll('caja'),
    exportadoEn: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `libreria-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importarRespaldo(file) {
  const texto = await file.text();
  const datos = JSON.parse(texto);
  const stores = ['ventas', 'gastos', 'deudas', 'productos', 'caja'];
  for (const store of stores) {
    if (!datos[store]) continue;
    await dbClear(store);
    for (const item of datos[store]) {
      await dbPut(store, item);
    }
  }
  await recargarTodo();
  alert('Datos importados correctamente.');
}

document.getElementById('btnExport').addEventListener('click', exportarRespaldo);
document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileImport').click());
document.getElementById('fileImport').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importarRespaldo(file).catch(() => alert('Archivo inválido.'));
});

// ============ CSV / PDF ============
function exportarCSV(nombre, datos) {
  const filas = datos.map(d => Object.values(d).join(','));
  const csv = filas.join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportarVentasCSV() {
  exportarCSV(`ventas-${todayStr()}.csv`, state.ventas.map(v => ({
    Fecha: v.fecha, Descripción: v.desc, Método: v.metodo || 'efectivo', Monto: v.monto,
  })));
}

function exportarGastosCSV() {
  exportarCSV(`gastos-${todayStr()}.csv`, state.gastos.map(g => ({
    Fecha: g.fecha, Descripción: g.desc, Monto: g.monto,
  })));
}

function exportarPDF(titulo, columnas, filas) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text(titulo, 14, 16);
  doc.autoTable({
    head: [columnas],
    body: filas,
    startY: 22,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 15, 15] },
  });
  doc.save(`${titulo.toLowerCase().replace(/\s/g, '-')}-${todayStr()}.pdf`);
}

function exportarVentasPDF() {
  exportarPDF('Reporte de Ventas', ['Fecha', 'Descripción', 'Método', 'Monto'],
    state.ventas.map(v => [v.fecha, v.desc, v.metodo || 'efectivo', fmt(v.monto)]));
}

function exportarGastosPDF() {
  exportarPDF('Reporte de Gastos', ['Fecha', 'Descripción', 'Monto'],
    state.gastos.map(g => [g.fecha, g.desc, fmt(g.monto)]));
}

// ============ TICKET ============
function imprimirTicket(venta) {
  const ventana = window.open('', '_blank', 'width=300,height=400');
  ventana.document.write(`
    <html><head><title>Ticket</title>
    <style>
      body { font-family: monospace; font-size: 12px; padding: 10px; }
      hr { border: 1px dashed #000; }
      .total { font-weight: bold; font-size: 14px; }
    </style></head><body>
      <h3>Librería</h3>
      <p>${new Date().toLocaleString()}</p>
      <hr>
      <p>${venta.desc}</p>
      <p class="total">Total: ${fmt(venta.monto)}</p>
      <hr>
      <p>¡Gracias por su compra!</p>
    </body></html>
  `);
  ventana.document.close();
  ventana.print();
}

const imprimirTicketPorId = (id) => {
  const v = state.ventas.find(x => x.id === id);
  if (v) imprimirTicket(v);
};

// ============ DRAFTS ============
async function activarDraft(formId, campos) {
  const form = document.getElementById(formId);
  if (!form) return;
  let timer;
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const data = {};
      campos.forEach(c => {
        const el = document.getElementById(c);
        if (el) data[c] = el.value;
      });
      await dbPut('drafts', { formId, data, updatedAt: Date.now() });
    }, 400);
  });
}

async function restaurarDraft(formId) {
  const draft = await dbGet('drafts', formId);
  if (!draft) return;
  Object.entries(draft.data).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  });
}

async function limpiarDraft(formId) {
  await dbDelete('drafts', formId);
}

// ============ ATAJOS ============
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const form = document.querySelector('.view:not(.hidden) form');
    if (form) form.reset();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('filtroVentasTexto')?.focus();
  }
});

// ============ TEMA ============
const aplicarTema = (tema) => document.documentElement.setAttribute('data-theme', tema);
const temaGuardado = localStorage.getItem('tema') || 'light';
aplicarTema(temaGuardado);

document.getElementById('btnTema').addEventListener('click', () => {
  const actual = document.documentElement.getAttribute('data-theme');
  const nuevo = actual === 'dark' ? 'light' : 'dark';
  aplicarTema(nuevo);
  localStorage.setItem('tema', nuevo);
});

// ============ PWA ============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ============ RENDER ALL ============
function renderAll() {
  renderVentas();
  renderGastos();
  renderDeudas();
  renderInventario();
  renderCaja();
  renderDashboard();
  renderCalendar();
}

// ============ INICIO ============
(async function init() {
  await cargarDatos();
  await cargarProductosEnSelect();
  renderAll();

  activarDraft('formVenta', ['ventaFecha', 'ventaDesc', 'ventaMonto']);
  activarDraft('formGasto', ['gastoFecha', 'gastoDesc', 'gastoMonto']);
  activarDraft('formDeuda', ['deudaFecha', 'deudaAcreedor', 'deudaMonto']);
  activarDraft('formProducto', ['prodNombre', 'prodCosto', 'prodPrecio', 'prodStock', 'prodMin']);

  await restaurarDraft('formVenta');
  await restaurarDraft('formGasto');
  await restaurarDraft('formDeuda');
  await restaurarDraft('formProducto');
})();

// ============ EXPONER FUNCIONES GLOBALES ============
window.eliminar = eliminar;
window.eliminarProducto = eliminarProducto;
window.pagarDeuda = pagarDeuda;
window.renderVentas = renderVentas;
window.renderGastos = renderGastos;
window.exportarVentasCSV = exportarVentasCSV;
window.exportarGastosCSV = exportarGastosCSV;
window.exportarVentasPDF = exportarVentasPDF;
window.exportarGastosPDF = exportarGastosPDF;
window.imprimirTicketPorId = imprimirTicketPorId;