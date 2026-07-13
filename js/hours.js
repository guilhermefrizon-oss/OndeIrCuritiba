// ── hours.js ──────────────────────────────────────────────────────
// Horário de funcionamento estruturado, por dia da semana.
//
// Formato do campo `hours` de um lugar:
//   { seg:{closed:false, open:"12:00", close:"23:00"}, ..., dom:{closed:true} }
// Um turno por dia; open>close significa que vira a madrugada (ex.: 18h→02h).
//
// Compatível com o campo antigo `h` (texto livre): quando um lugar não tem
// `hours`, tentamos interpretar o texto. Nada quebra se não der.

// getDay(): 0=Dom … 6=Sáb
export const DOW_KEYS   = ['dom','seg','ter','qua','qui','sex','sab'];
// Ordem de exibição (segunda primeiro, padrão BR)
export const WEEK_ORDER = ['seg','ter','qua','qui','sex','sab','dom'];
export const DAY_LABEL  = { seg:'Seg', ter:'Ter', qua:'Qua', qui:'Qui', sex:'Sex', sab:'Sáb', dom:'Dom' };

// Faixas contíguas (cobrem 24h sem buraco). A Noite começa às 19h pra que
// lugares que fecham ~18h caiam na Tarde, e bares que abrem tarde na Noite.
export const PERIODS = [
  { key:'manha',     label:'Manhã',     start: 6*60, end: 12*60 },
  { key:'tarde',     label:'Tarde',     start:12*60, end: 19*60 },
  { key:'noite',     label:'Noite',     start:19*60, end: 24*60 },
  { key:'madrugada', label:'Madrugada', start: 0,    end:  6*60 },
];

const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Intervalos (em minutos, 0..1440) em que o lugar está aberto NAQUELE dia do
// calendário — combinando o turno do próprio dia + o que "vaza" da madrugada
// do dia anterior. Ex.: Sex 18h-02h contribui [0,120) no sábado.
export function openIntervalsOnDay(hours, dowIdx) {
  if (!hours) return null;
  const key  = DOW_KEYS[((dowIdx % 7) + 7) % 7];
  const pkey = DOW_KEYS[(((dowIdx - 1) % 7) + 7) % 7];
  const e  = hours[key];
  const pv = hours[pkey];
  const out = [];
  if (e && !e.closed && e.open != null && e.close != null) {
    const o = toMin(e.open), c = toMin(e.close);
    if (c > o)      out.push([o, c]);
    else if (c < o) out.push([o, 1440]);   // cruza a meia-noite: parte do próprio dia
    else            out.push([0, 1440]);    // open==close → 24h (raro)
  }
  if (pv && !pv.closed && pv.open != null && pv.close != null) {
    const o = toMin(pv.open), c = toMin(pv.close);
    if (c < o) out.push([0, c]);            // madrugada que vem do dia anterior
  }
  return out;
}

export function isOpenAt(hours, dowIdx, minutes) {
  const iv = openIntervalsOnDay(hours, dowIdx);
  if (!iv) return null;
  return iv.some(([a, b]) => minutes >= a && minutes < b);
}

// Está aberto em ALGUM momento da janela [pStart,pEnd) daquele dia?
export function isOpenDuring(hours, dowIdx, pStart, pEnd) {
  const iv = openIntervalsOnDay(hours, dowIdx);
  if (!iv) return null;
  return iv.some(([a, b]) => Math.max(a, pStart) < Math.min(b, pEnd));
}

// ── Compatibilidade com o texto antigo `h` ─────────────────────────
const _DAY_TOKEN = { dom:'dom', seg:'seg', ter:'ter', qua:'qua', qui:'qui', sex:'sex', sab:'sab', 'sáb':'sab' };

// Interpreta "Seg-Sáb 09h-18h30 · Dom 10h-20h" → objeto hours (best-effort).
// Dias não citados ficam fechados. Retorna null se não conseguir nada.
export function parseHoursText(text) {
  if (!text || typeof text !== 'string') return null;
  const hours = {};
  WEEK_ORDER.forEach(k => { hours[k] = { closed: true }; });
  let any = false;

  text.toLowerCase().split(/[·;,]/).forEach(seg => {
    const dm = seg.match(/(dom|seg|ter|qua|qui|sex|sáb|sab)\s*(?:[-–a]\s*(dom|seg|ter|qua|qui|sex|sáb|sab))?/);
    const tm = seg.match(/(\d{1,2})h(\d{2})?\s*[-–às]+\s*(\d{1,2})h(\d{2})?/);
    if (!dm || !tm) return;
    const d1 = _DAY_TOKEN[dm[1]];
    const d2 = dm[2] ? _DAY_TOKEN[dm[2]] : d1;
    const open  = `${String(tm[1]).padStart(2,'0')}:${tm[2] || '00'}`;
    const close = `${String(tm[3]).padStart(2,'0')}:${tm[4] || '00'}`;
    const i1 = WEEK_ORDER.indexOf(d1), i2 = WEEK_ORDER.indexOf(d2);
    if (i1 < 0 || i2 < 0) return;
    const span = i1 <= i2 ? range(i1, i2) : [...range(i1, 6), ...range(0, i2)];
    span.forEach(i => { hours[WEEK_ORDER[i]] = { closed:false, open, close }; any = true; });
  });
  return any ? hours : null;
}

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

// Devolve o hours estruturado do lugar (usa `hours` salvo ou interpreta `h`).
export function getPlaceHours(p) {
  if (p && p.hours && typeof p.hours === 'object') return p.hours;
  if (p && p.h) return parseHoursText(p.h);
  return null;
}

// true/false/null — aberto agora (null = horário desconhecido)
export function isOpenNow(p) {
  const h = getPlaceHours(p);
  if (!h) return null;
  const now = new Date();
  return isOpenAt(h, now.getDay(), now.getHours() * 60 + now.getMinutes());
}

// ── Texto legível a partir do estruturado ──────────────────────────
function fmtMin(hhmm) {
  const [h, m] = String(hhmm).split(':');
  const mm = (m && m !== '00') ? m : '';
  return `${parseInt(h, 10)}h${mm}`;
}

// Gera "Seg-Sex 12h-23h · Sáb 12h-01h · Dom fechado" agrupando dias iguais.
export function hoursToText(hours) {
  if (!hours) return '';
  const sig = (d) => {
    const e = hours[d];
    if (!e || e.closed || e.open == null || e.close == null) return 'X';
    return `${e.open}-${e.close}`;
  };
  const segs = [];
  let i = 0;
  while (i < WEEK_ORDER.length) {
    let j = i;
    while (j + 1 < WEEK_ORDER.length && sig(WEEK_ORDER[j + 1]) === sig(WEEK_ORDER[i])) j++;
    const s = sig(WEEK_ORDER[i]);
    const dayPart = i === j
      ? DAY_LABEL[WEEK_ORDER[i]]
      : `${DAY_LABEL[WEEK_ORDER[i]]}-${DAY_LABEL[WEEK_ORDER[j]]}`;
    if (s === 'X') segs.push(`${dayPart} fechado`);
    else {
      const e = hours[WEEK_ORDER[i]];
      segs.push(`${dayPart} ${fmtMin(e.open)}-${fmtMin(e.close)}`);
    }
    i = j + 1;
  }
  // Se todo dia fechado, texto único
  if (segs.every(s => s.endsWith('fechado'))) return 'Fechado';
  return segs.join(' · ');
}

// hours "vazio" padrão pro editor do admin (todos abertos num horário comum)
export function defaultHours(open = '12:00', close = '23:00') {
  const h = {};
  WEEK_ORDER.forEach(k => { h[k] = { closed:false, open, close }; });
  return h;
}
