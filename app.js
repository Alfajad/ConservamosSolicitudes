const SUPABASE_URL = "https://sgnxbqectwhdqwgtpzeo.supabase.co";
const SUPABASE_KEY = "sb_publishable_5eobgpi7SzIjMjCzzDc9lA_nbLraq69";
const STORAGE_BUCKET = "documentos-proveedores";

const loginView = document.querySelector('#loginView');
const appView = document.querySelector('#appView');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const listEl = document.querySelector('#list');
const modal = document.querySelector('#detailModal');
const detailContent = document.querySelector('#detailContent');
const searchInput = document.querySelector('#searchInput');
const sortSelect = document.querySelector('#sortSelect');
const diagnostic = document.querySelector('#diagnostic');

function diag(message, type='') {
  if (!diagnostic) return;
  diagnostic.textContent = message;
  diagnostic.className = 'diagnostic' + (type ? ' ' + type : '');
}

window.addEventListener('error', (e) => {
  diag('Error JavaScript: ' + (e.message || 'desconocido'), 'bad');
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || 'Error desconocido');
  diag('Error no controlado: ' + msg, 'bad');
});


let requests = [];
let currentFilter = 'Todos';
let session = null;

const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function saveSession(s) {
  session = s;
  if (s) localStorage.setItem('conservamos_panel_session', JSON.stringify(s));
  else localStorage.removeItem('conservamos_panel_session');
}

function loadSavedSession() {
  try {
    const raw = localStorage.getItem('conservamos_panel_session');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function authFetch(path, options={}) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers
  });
}

async function signIn(email,password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:'POST',
    headers:{
      'apikey': SUPABASE_KEY,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'No fue posible iniciar sesión.');
  }
  return data;
}

async function validateSession(s) {
  if (!s?.access_token) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers:{
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${s.access_token}`
      }
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function showSession(s) {
  saveSession(s);
  if (!s) {
    loginView.hidden = false;
    appView.hidden = true;
    return;
  }
  loginView.hidden = true;
  appView.hidden = false;
  document.querySelector('#userEmail').textContent = s.user?.email || '';
  await loadRequests();
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';

  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  const btn = loginForm.querySelector('button');

  if (!email || !password) {
    diag('Falta correo o contraseña.', 'bad');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Ingresando…';
  diag('1/3 Conectando con Supabase…');

  try {
    const data = await signIn(email,password);
    diag('2/3 Credenciales aceptadas. Cargando panel…', 'ok');

    saveSession(data);
    loginView.hidden = true;
    appView.hidden = false;
    document.querySelector('#userEmail').textContent = data.user?.email || email;

    listEl.innerHTML = '<div class="empty">3/3 Cargando solicitudes…</div>';

    try {
      await loadRequests();
    } catch (loadError) {
      console.error(loadError);
      listEl.innerHTML = `<div class="empty"><strong>Login correcto, pero ocurrió un error cargando solicitudes.</strong><br><br>${esc(loadError.message || String(loadError))}</div>`;
    }
  } catch (error) {
    console.error(error);
    const msg = error.message || String(error) || 'Error desconocido';
    loginError.textContent = msg;
    diag('Login rechazado por Supabase: ' + msg, 'bad');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

document.querySelector('#logoutBtn').addEventListener('click', async () => {
  try {
    if (session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method:'POST',
        headers:{
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });
    }
  } catch (_) {}
  requests = [];
  await showSession(null);
});

async function loadRequests() {
  listEl.innerHTML = '<div class="empty">Cargando solicitudes…</div>';

  const response = await authFetch('/rest/v1/solicitudes_proveedores?select=*&order=created_at.desc', {
    method:'GET'
  });

  if (!response.ok) {
    const err = await response.json().catch(()=>({}));
    const msg = err.message || err.details || err.hint || `Error HTTP ${response.status}`;
    listEl.innerHTML = `
      <div class="empty">
        <strong>El inicio de sesión fue aceptado, pero no pudimos leer las solicitudes.</strong><br><br>
        <strong>Error de Supabase:</strong> ${esc(msg)}<br>
        <strong>Código HTTP:</strong> ${response.status}<br><br>
        Revisa que hayas ejecutado las políticas SELECT/UPDATE para el rol authenticated.
      </div>`;
    return;
  }

  requests = await response.json();
  updateCounts();
  renderList();
  diag('3/3 Panel cargado correctamente.', 'ok');
}

function updateCounts() {
  document.querySelector('#allCount').textContent = requests.length;
  document.querySelector('#pendingCount').textContent = requests.filter(x=>x.estado==='Pendiente').length;
  document.querySelector('#approvedCount').textContent = requests.filter(x=>x.estado==='Aprobado').length;
  document.querySelector('#rejectedCount').textContent = requests.filter(x=>x.estado==='Rechazado').length;
}

function renderList() {
  const q = norm(searchInput.value);
  let rows = requests.filter(r => {
    const statusOk = currentFilter === 'Todos' || r.estado === currentFilter;
    const text = norm([r.razon_social,r.ciudad,r.especialidad,r.contacto,r.telefono,r.correo].join(' '));
    return statusOk && (!q || text.includes(q));
  });

  if (sortSelect.value === 'oldest') rows.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if (sortSelect.value === 'name') rows.sort((a,b)=>String(a.razon_social).localeCompare(String(b.razon_social),'es',{sensitivity:'base'}));
  else rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty">No hay solicitudes con este filtro.</div>';
    return;
  }

  listEl.innerHTML = rows.map(r=>`
    <button class="request-row" onclick="openDetail(${r.id})">
      <div><strong>${esc(r.razon_social)}</strong><div class="meta">${esc(r.contacto)} · ${esc(r.correo)}</div></div>
      <div><span class="pill">${esc(r.especialidad)}</span><div class="meta">${esc(r.ciudad)}</div></div>
      <div><div>${new Date(r.created_at).toLocaleDateString('es-CO')}</div><div class="meta">${new Date(r.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</div></div>
      <span class="pill ${esc(r.estado)}">${esc(r.estado || 'Pendiente')}</span>
    </button>
  `).join('');
}


function humanSize(bytes){
  const n=Number(bytes||0);
  if(!n) return '';
  if(n < 1024) return n + ' B';
  if(n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/(1024*1024)).toFixed(1) + ' MB';
}

async function listDocuments(reference){
  if(!reference) return [];
  const response = await authFetch(`/storage/v1/object/list/${STORAGE_BUCKET}`, {
    method:'POST',
    body: JSON.stringify({
      prefix: reference,
      limit: 100,
      offset: 0,
      sortBy: {column:'name', order:'asc'}
    })
  });
  if(!response.ok){
    const err=await response.json().catch(()=>({}));
    throw new Error(err.message || err.error || `HTTP ${response.status}`);
  }
  const rows=await response.json();
  return (rows||[]).filter(x=>x.id !== null);
}

async function downloadDocument(reference, filename){
  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${STORAGE_BUCKET}/${encodeURIComponent(reference)}/${encodeURIComponent(filename)}?download=${encodeURIComponent(filename)}`;
  const response = await fetch(url,{
    headers:{
      'apikey':SUPABASE_KEY,
      'Authorization':`Bearer ${session.access_token}`
    }
  });
  if(!response.ok){
    const err=await response.json().catch(()=>({}));
    throw new Error(err.message || err.error || `HTTP ${response.status}`);
  }
  const blob=await response.blob();
  const objectUrl=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=objectUrl;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
}
window.downloadDocument = downloadDocument;

window.openDetail = async function(id) {
  const r = requests.find(x=>String(x.id)===String(id));
  if (!r) return;

  const fields = [
    ['Razón social',r.razon_social],['Estado',r.estado],['Tipo de identificación',r.tipo_identificacion],['Identificación',r.identificacion],
    ['Régimen IVA',r.regimen_iva],['Ciudad',r.ciudad],['Dirección',r.direccion],['Especialidad',r.especialidad],
    ['Años de experiencia',r.experiencia],['Cobertura',r.cobertura],['Descripción',r.descripcion],['Contacto',r.contacto],
    ['Cargo',r.cargo],['Teléfono',r.telefono],['Correo',r.correo],['Comentarios',r.comentarios]
  ];

  detailContent.innerHTML = `
    <div class="detail-head">
      <p class="eyebrow">SOLICITUD #${esc(r.id)}</p>
      <h2>${esc(r.razon_social)}</h2>
      <div class="meta">Recibida ${new Date(r.created_at).toLocaleString('es-CO')}</div>
    </div>
    <dl class="detail-grid">
      ${fields.map(([k,v])=>`<div class="field"><dt>${esc(k)}</dt><dd>${esc(v ?? 'No registrado')}</dd></div>`).join('')}
    </dl>
    <section class="documents-section">
      <div class="documents-head">
        <div><p class="eyebrow">DOCUMENTOS</p><h3>Soportes adjuntos</h3></div>
        <span id="docsCount" class="pill">Cargando…</span>
      </div>
      <div id="documentsList" class="documents-list">
        <div class="empty">Consultando documentos…</div>
      </div>
    </section>
    <div class="detail-actions">
      <button class="approve" onclick="setStatus(${r.id},'Aprobado')">Aprobar</button>
      <button class="reject" onclick="setStatus(${r.id},'Rechazado')">Rechazar</button>
      <button class="pending" onclick="setStatus(${r.id},'Pendiente')">Dejar pendiente</button>
    </div>`;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  const docsList = document.querySelector('#documentsList');
  const docsCount = document.querySelector('#docsCount');

  if(!r.documentos_ref){
    docsCount.textContent='0 archivos';
    docsList.innerHTML='<div class="empty">Esta solicitud no tiene documentos adjuntos.</div>';
    return;
  }

  try{
    const docs=await listDocuments(r.documentos_ref);
    docsCount.textContent=`${docs.length} archivo${docs.length===1?'':'s'}`;
    if(!docs.length){
      docsList.innerHTML='<div class="empty">No encontramos documentos en esta solicitud.</div>';
      return;
    }
    docsList.innerHTML=docs.map(file=>`
      <div class="document-row">
        <div class="document-icon">DOC</div>
        <div class="document-name">
          <strong>${esc(file.name.replace(/^\d{2}-/,''))}</strong>
          <small>${humanSize(file.metadata?.size)}${file.created_at?' · '+new Date(file.created_at).toLocaleString('es-CO'):''}</small>
        </div>
        <button onclick='downloadDocument(${JSON.stringify(r.documentos_ref)},${JSON.stringify(file.name)})'>Descargar</button>
      </div>
    `).join('');
  }catch(error){
    console.error(error);
    docsCount.textContent='Error';
    docsList.innerHTML=`<div class="empty"><strong>No pudimos consultar los documentos.</strong><br>${esc(error.message)}</div>`;
  }
}

window.setStatus = async function(id,status) {
  const buttons = detailContent.querySelectorAll('.detail-actions button');
  buttons.forEach(b=>b.disabled=true);

  try {
    let response;

    if(status === 'Aprobado'){
      // La función SQL crea el proveedor si no existe y marca la solicitud como Aprobado.
      response = await authFetch('/rest/v1/rpc/aprobar_proveedor', {
        method:'POST',
        body: JSON.stringify({ p_solicitud_id: Number(id) })
      });
    } else {
      // Rechazado o Pendiente: solo cambia el estado de la solicitud.
      response = await authFetch(`/rest/v1/solicitudes_proveedores?id=eq.${encodeURIComponent(id)}`, {
        method:'PATCH',
        headers:{ 'Prefer':'return=minimal' },
        body: JSON.stringify({ estado: status })
      });
    }

    if(!response.ok){
      const err = await response.json().catch(()=>({}));
      throw new Error(err.message || err.details || `Error HTTP ${response.status}`);
    }

    const r = requests.find(x=>String(x.id)===String(id));
    if(r) r.estado = status;

    updateCounts();
    renderList();
    closeDetail();

    if(status === 'Aprobado'){
      alert('Proveedor aprobado y agregado al directorio de proveedores.');
    }
  } catch(error){
    alert('No se pudo cambiar el estado: ' + (error.message || String(error)));
  } finally {
    buttons.forEach(b=>b.disabled=false);
  }
}

function closeDetail() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

document.querySelector('#closeDetail').addEventListener('click', closeDetail);
document.querySelector('.overlay').addEventListener('click', closeDetail);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeDetail()});
document.querySelector('#refreshBtn').addEventListener('click',loadRequests);
searchInput.addEventListener('input',renderList);
sortSelect.addEventListener('change',renderList);

document.querySelectorAll('.stat').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.stat').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderList();
}));

(async function init() {
  saveSession(null);
  loginView.hidden = false;
  appView.hidden = true;
  diag('Listo para iniciar sesión.');
})();
